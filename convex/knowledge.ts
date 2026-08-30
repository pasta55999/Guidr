import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getLessonBySlug } from "./lessons";
import { DOC_SOURCE_URL, LESSON_SLUG } from "./seed";
import {
  FIXTURE_TITLE,
  FTA_TAX_INVOICE_MARKDOWN,
} from "./fixtures/ftaTaxInvoice";

// ---------------------------------------------------------------------------
// Knowledge layer.
//
// Context.dev is called from `ingest` only — an offline, operator-triggered
// action. It is NEVER called on a voice turn: the `lookup_docs` tool hits the
// `search` query below, which reads Convex tables and nothing else.
// ---------------------------------------------------------------------------

const CONTEXT_DEV_MARKDOWN_ENDPOINT =
  "https://api.context.dev/v1/web/scrape/markdown";

/** How long a cached knowledgeDocs row is considered fresh. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Hard cap on a single chunk's text, in characters. */
const MAX_CHUNK_CHARS = 1200;

/** Chunks shorter than this are boilerplate (nav crumbs, page numbers, headers). */
const MIN_CHUNK_CHARS = 80;

const DOC_TITLE = "UAE FTA — Tax invoices (VAT11)";

// ---------------------------------------------------------------------------
// Tokenising / keywords
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "that",
  "this", "have", "has", "had", "from", "was", "were", "been", "being", "its",
  "it's", "they", "them", "their", "there", "then", "than", "when", "where",
  "which", "who", "whom", "whose", "what", "will", "would", "shall", "should",
  "can", "could", "may", "might", "must", "does", "did", "doing", "done",
  "into", "onto", "upon", "over", "under", "about", "above", "below", "between",
  "also", "any", "all", "each", "every", "some", "such", "only", "other",
  "more", "most", "much", "many", "very", "just", "same", "both", "because",
  "how", "why", "our", "out", "off", "own", "per", "via", "yes", "get",
  "got", "need", "needs", "needed", "want", "wants", "make", "makes", "made",
  "use", "used", "using", "one", "two", "three", "here", "his", "her", "hers",
  "him", "she", "etc",
]);

/**
 * Unicode-aware tokeniser. Splits on anything that is not a letter or digit in
 * ANY script, so Arabic text in the source PDF tokenises correctly rather than
 * being dropped or crashing.
 */
export function tokenize(input: string): string[] {
  if (!input) return [];
  const lowered = input.toLowerCase();
  const raw = lowered.split(/[^\p{L}\p{N}]+/u);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of raw) {
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export type KnowledgeChunk = {
  heading: string;
  text: string;
  keywords: string[];
  relatedStepIndex?: number;
};

/**
 * Maps a chunk to a lesson step when the mapping is obvious. Deliberately a
 * simple, readable keyword heuristic — the tutor does not depend on it being
 * right, it only uses it to prefer on-topic chunks.
 *
 * 1 = select supplier (name / address / TRN)
 * 2 = enter amount (AED, gross, VAT amount, currency)
 * 3 = description of goods or services
 * 4 = submit (sequential invoice number, date of issue)
 */
function guessRelatedStepIndex(heading: string, text: string): number | undefined {
  const hay = `${heading}\n${text}`.toLowerCase();

  if (/\btrn\b|tax registration number|supplier'?s? name|name, address/.test(hay)) {
    return 1;
  }
  if (/\baed\b|gross amount|amount payable|exchange rate|unit price|vat amount/.test(hay)) {
    return 2;
  }
  if (/description of the goods|description of goods|goods or services supplied/.test(hay)) {
    return 3;
  }
  if (/sequential|unique number|invoice number|date of issue/.test(hay)) {
    return 4;
  }
  return undefined;
}

/** Splits an over-long body on paragraph, then sentence, boundaries. Never mid-word. */
function splitToCap(body: string): string[] {
  if (body.length <= MAX_CHUNK_CHARS) return [body];

  const pieces: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) pieces.push(trimmed);
    current = "";
  };

  const units: string[] = [];
  for (const paragraph of body.split(/\n{2,}/)) {
    if (paragraph.length <= MAX_CHUNK_CHARS) {
      units.push(paragraph);
      continue;
    }
    // Paragraph alone is too long: fall back to sentence boundaries.
    let sentence = "";
    for (const part of paragraph.split(/(?<=[.!?])\s+/)) {
      if (part.length > MAX_CHUNK_CHARS) {
        // Pathological single "sentence": break on the last word boundary.
        if (sentence.trim()) units.push(sentence.trim());
        sentence = "";
        let rest = part;
        while (rest.length > MAX_CHUNK_CHARS) {
          const window = rest.slice(0, MAX_CHUNK_CHARS);
          const cut = window.lastIndexOf(" ");
          const at = cut > MAX_CHUNK_CHARS * 0.5 ? cut : MAX_CHUNK_CHARS;
          units.push(rest.slice(0, at).trim());
          rest = rest.slice(at);
        }
        if (rest.trim()) sentence = rest.trim();
        continue;
      }
      if ((sentence + " " + part).trim().length > MAX_CHUNK_CHARS) {
        if (sentence.trim()) units.push(sentence.trim());
        sentence = part;
      } else {
        sentence = sentence ? `${sentence} ${part}` : part;
      }
    }
    if (sentence.trim()) units.push(sentence.trim());
  }

  for (const unit of units) {
    if ((current ? current.length + 2 : 0) + unit.length > MAX_CHUNK_CHARS) {
      flush();
    }
    current = current ? `${current}\n\n${unit}` : unit;
  }
  flush();

  return pieces;
}

function cleanHeading(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits markdown into retrieval chunks on `##` / `###` headings. Each chunk
 * keeps its heading plus the body beneath it, is hard-capped at ~1200 chars,
 * and carries a keyword list for the (deliberately dumb, deliberately fast)
 * scoring in `search`.
 *
 * Plain exported function so it can be unit-tested without a Convex context.
 */
export function chunkMarkdown(
  markdown: string,
  fallbackHeading = DOC_TITLE,
): KnowledgeChunk[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");

  const sections: { heading: string; body: string[] }[] = [];
  let heading = fallbackHeading;
  let body: string[] = [];
  let inFence = false;
  let seenHeading = false;

  const pushSection = () => {
    sections.push({ heading, body });
    body = [];
  };

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (/^(```|~~~)/.test(trimmed)) inFence = !inFence;

    // Primary split is on `##` / `###`. A leading `#` is treated as the document
    // title (it just names the preamble); any later `#` is a section break too,
    // because PDF-to-markdown conversions often emit only `#` headings.
    if (!inFence && /^#{1,3}\s+\S/.test(trimmed)) {
      const isTopLevel = /^#\s/.test(trimmed);
      const title = cleanHeading(trimmed) || fallbackHeading;
      if (isTopLevel && !seenHeading && body.join("").trim() === "") {
        heading = title;
      } else {
        pushSection();
        heading = title;
      }
      seenHeading = true;
      continue;
    }
    body.push(line);
  }
  pushSection();

  const chunks: KnowledgeChunk[] = [];
  for (const section of sections) {
    const bodyText = section.body
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!bodyText) continue;

    for (const part of splitToCap(bodyText)) {
      const text = `${section.heading}\n\n${part}`.trim();
      if (part.trim().length < MIN_CHUNK_CHARS) continue;
      chunks.push({
        heading: section.heading,
        text,
        keywords: tokenize(text),
        relatedStepIndex: guessRelatedStepIndex(section.heading, part),
      });
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const chunkValidator = v.object({
  heading: v.string(),
  text: v.string(),
  keywords: v.array(v.string()),
  relatedStepIndex: v.optional(v.number()),
});

async function replaceKnowledge(
  ctx: MutationCtx,
  args: {
    sourceUrl: string;
    title: string;
    markdown: string;
    creditsConsumed?: number;
    chunks: KnowledgeChunk[];
  },
) {
  const lesson = await getLessonBySlug(ctx.db, LESSON_SLUG);
  if (!lesson) {
    throw new Error(
      `Lesson "${LESSON_SLUG}" not found. Run: npx convex run seed:seedInvoiceLesson`,
    );
  }
  const lessonId = lesson._id as Id<"lessons">;

  // Idempotent: wipe every existing doc + chunk for this lesson first, so
  // re-ingesting can never duplicate rows.
  const oldChunks = await ctx.db
    .query("knowledgeChunks")
    .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
    .collect();
  for (const row of oldChunks) await ctx.db.delete(row._id);

  const oldDocs = await ctx.db
    .query("knowledgeDocs")
    .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
    .collect();
  for (const row of oldDocs) await ctx.db.delete(row._id);

  const docId: Id<"knowledgeDocs"> = await ctx.db.insert("knowledgeDocs", {
    lessonId,
    sourceUrl: args.sourceUrl,
    title: args.title,
    provider: "context.dev" as const,
    markdown: args.markdown,
    fetchedAt: Date.now(),
    creditsConsumed: args.creditsConsumed,
  });

  for (const chunk of args.chunks) {
    await ctx.db.insert("knowledgeChunks", {
      lessonId,
      docId,
      heading: chunk.heading,
      text: chunk.text,
      keywords: chunk.keywords,
      relatedStepIndex: chunk.relatedStepIndex,
    });
  }

  return { lessonId, docId, chunkCount: args.chunks.length };
}

export const upsertDoc = internalMutation({
  args: {
    sourceUrl: v.string(),
    title: v.string(),
    markdown: v.string(),
    creditsConsumed: v.optional(v.number()),
    chunks: v.array(chunkValidator),
  },
  handler: async (ctx, args) => replaceKnowledge(ctx, args),
});

/** Cache probe for `ingest`. Actions cannot read the DB directly. */
export const cacheStatus = internalQuery({
  args: { sourceUrl: v.string() },
  handler: async (ctx, { sourceUrl }) => {
    const lesson = await getLessonBySlug(ctx.db, LESSON_SLUG);
    if (!lesson) return null;
    const docs = await ctx.db
      .query("knowledgeDocs")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
      .collect();
    const doc = docs.find((d) => d.sourceUrl === sourceUrl);
    if (!doc) return null;
    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
      .collect();
    return {
      fetchedAt: doc.fetchedAt,
      creditsConsumed: doc.creditsConsumed,
      chunkCount: chunks.length,
    };
  },
});

// ---------------------------------------------------------------------------
// Ingest (offline, operator-triggered, never on a voice turn)
// ---------------------------------------------------------------------------

type ScrapeResult = { markdown: string; creditsConsumed?: number };

async function scrapeMarkdown(url: string, apiKey: string): Promise<ScrapeResult> {
  const endpoint = `${CONTEXT_DEV_MARKDOWN_ENDPOINT}?${new URLSearchParams({
    url,
    useMainContentOnly: "true",
  }).toString()}`;

  const attempt = async () =>
    await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

  let res = await attempt();
  if (res.status === 429 || res.status >= 500) {
    // One retry, short backoff. Never retry other 4xx — those are our bug.
    await new Promise((r) => setTimeout(r, 1500));
    res = await attempt();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Context.dev scrape failed: HTTP ${res.status} ${res.statusText}. ${body.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    success?: boolean;
    markdown?: string;
    key_metadata?: { credits_consumed?: number } | null;
  };

  const markdown = typeof json.markdown === "string" ? json.markdown : "";
  if (json.success === false || markdown.trim().length === 0) {
    throw new Error(
      "Context.dev returned no markdown for the source URL. Fall back to knowledge:ingestFixture.",
    );
  }

  const credits = json.key_metadata?.credits_consumed;
  return {
    markdown,
    creditsConsumed: typeof credits === "number" ? credits : undefined,
  };
}

/**
 * Offline one-time ingest. Fetches the FTA tax-invoice PDF through Context.dev's
 * markdown endpoint, chunks it and stores the result in Convex.
 *
 * Never call this from a voice turn — it makes an external network request and
 * consumes Context.dev credits. `search` is the live-turn entry point.
 */
export const ingest = action({
  args: { force: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { force },
  ): Promise<{
    ok: boolean;
    cached: boolean;
    chunkCount: number;
    creditsConsumed?: number;
  }> => {
    const apiKey = process.env.CONTEXT_DEV_API_KEY;
    if (!apiKey) {
      throw new Error(
        "CONTEXT_DEV_API_KEY is not set on this Convex deployment. Run:\n" +
          "  npx convex env set CONTEXT_DEV_API_KEY ctxt_secret_...\n" +
          "(or run `npx convex run knowledge:ingestFixture` to use the committed fallback snapshot).",
      );
    }

    if (!force) {
      const cached = await ctx.runQuery(internal.knowledge.cacheStatus, {
        sourceUrl: DOC_SOURCE_URL,
      });
      if (
        cached &&
        cached.chunkCount > 0 &&
        Date.now() - cached.fetchedAt < CACHE_TTL_MS
      ) {
        return {
          ok: true,
          cached: true,
          chunkCount: cached.chunkCount,
          creditsConsumed: cached.creditsConsumed,
        };
      }
    }

    const { markdown, creditsConsumed } = await scrapeMarkdown(
      DOC_SOURCE_URL,
      apiKey,
    );
    const chunks = chunkMarkdown(markdown);
    if (chunks.length === 0) {
      throw new Error(
        "Context.dev markdown produced zero usable chunks; refusing to wipe existing knowledge. " +
          "Inspect the response or use knowledge:ingestFixture.",
      );
    }

    const { chunkCount } = await ctx.runMutation(internal.knowledge.upsertDoc, {
      sourceUrl: DOC_SOURCE_URL,
      title: DOC_TITLE,
      markdown,
      creditsConsumed,
      chunks,
    });

    return { ok: true, cached: false, chunkCount, creditsConsumed };
  },
});

/**
 * Same chunker, same upsert path, local fixture instead of the network. Use when
 * CONTEXT_DEV_API_KEY is unavailable or credits must be preserved.
 */
export const ingestFixture = mutation({
  args: {},
  handler: async (ctx) => {
    const chunks = chunkMarkdown(FTA_TAX_INVOICE_MARKDOWN);
    const { chunkCount } = await replaceKnowledge(ctx, {
      sourceUrl: DOC_SOURCE_URL,
      title: FIXTURE_TITLE,
      markdown: FTA_TAX_INVOICE_MARKDOWN,
      chunks,
    });
    return { ok: true, cached: false, source: "fixture" as const, chunkCount };
  },
});

// ---------------------------------------------------------------------------
// Search — the live-turn path. DB reads only, no network, no LLM.
// ---------------------------------------------------------------------------

export const search = query({
  args: {
    lessonId: v.optional(v.id("lessons")),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let lessonId = args.lessonId ?? null;
    let sourceUrl = DOC_SOURCE_URL;

    if (!lessonId) {
      const lesson = await getLessonBySlug(ctx.db, LESSON_SLUG);
      if (!lesson) return { ok: true, sourceUrl, chunks: [] };
      lessonId = lesson._id;
      sourceUrl = lesson.docSourceUrl || DOC_SOURCE_URL;
    }

    const docs = await ctx.db
      .query("knowledgeDocs")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId!))
      .collect();
    if (docs.length > 0) sourceUrl = docs[0].sourceUrl;

    const tokens = tokenize(args.query);
    if (tokens.length === 0) {
      // Empty / whitespace-only / all-stopword query: nothing to match on.
      return { ok: true, sourceUrl, chunks: [] };
    }

    const rows = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId!))
      .collect();

    const needle = args.query.trim().toLowerCase();
    const limit = Math.max(1, Math.min(args.limit ?? 3, 10));

    const scored = rows.map((row) => {
      const keywords = new Set(row.keywords);
      const headingTokens = new Set(tokenize(row.heading));
      const lowerText = row.text.toLowerCase();

      let score = 0;
      for (const token of tokens) {
        if (keywords.has(token)) score += 2;
        if (headingTokens.has(token)) score += 1.5;
      }
      if (needle.length >= 4 && lowerText.includes(needle)) score += 1;
      return { row, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return {
      ok: true,
      sourceUrl,
      chunks: scored
        .filter((s) => s.score > 0)
        .slice(0, limit)
        .map((s) => ({ heading: s.row.heading, text: s.row.text })),
    };
  },
});
