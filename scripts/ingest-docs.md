# Runbook — ingesting the FTA tax-invoice docs (Context.dev)

**This is an offline, one-time operator step. It is never called from a voice turn.**
The live `lookup_docs` tool calls `knowledge:search`, which is a plain Convex query
reading `knowledgeChunks` only — no external network, no Context.dev, no credits.

`npx convex dev` must already be running against the local anonymous deployment
(`http://127.0.0.1:3210`). A shell may need Node on its PATH first:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

PowerShell blocks `npm.ps1`, so always use the absolute `.cmd` form.

## 0. Seed the lesson (ingest needs a lesson row to attach to)

```powershell
& "C:\Program Files\nodejs\npx.cmd" convex run seed:seedInvoiceLesson
```

## 1. Set the Context.dev key (Convex env var only — never `.env*`, never `VITE_`)

```powershell
& "C:\Program Files\nodejs\npx.cmd" convex env set CONTEXT_DEV_API_KEY ctxt_secret_xxxxxxxx
& "C:\Program Files\nodejs\npx.cmd" convex env list      # prints names, confirms it is set
```

## 2. Live ingest

```powershell
& "C:\Program Files\nodejs\npx.cmd" convex run knowledge:ingest
```

- Fetches `DOC_SOURCE_URL` (the FTA `VAT11 - Tax invoices En.pdf`) through
  `GET https://api.context.dev/v1/web/scrape/markdown?url=...&useMainContentOnly=true`.
  Context.dev converts the PDF to markdown server-side.
- Retries once, after a short backoff, on HTTP 429 or 5xx. Other 4xx fail fast.
- **Cache guard:** if a `knowledgeDocs` row for this lesson + source URL is younger
  than 24 h, no network call is made and it returns `{ ok: true, cached: true, ... }`.
  Force a refetch with:

```powershell
& "C:\Program Files\nodejs\npx.cmd" convex run knowledge:ingest '{\"force\":true}'
```

Returns `{ ok, cached, chunkCount, creditsConsumed }`.

## 3. Fixture ingest (no key / no network / preserve credits)

```powershell
& "C:\Program Files\nodejs\npx.cmd" convex run knowledge:ingestFixture
```

Runs the committed snapshot in `convex/fixtures/ftaTaxInvoice.ts` through the **same**
chunker and the **same** upsert path, so retrieval behaves identically to the live path.
Use this for demos and for offline development.

## 4. Verify

```powershell
& "C:\Program Files\nodejs\npx.cmd" convex run knowledge:search '{\"query\":\"do I need the supplier TRN on the invoice\"}'
& "C:\Program Files\nodejs\npx.cmd" convex run knowledge:search '{\"query\":\"gross amount payable in AED\"}'
& "C:\Program Files\nodejs\npx.cmd" convex run knowledge:search '{\"query\":\"\"}'   # -> chunks: [], must not throw
```

Note the PowerShell JSON quoting: single-quoted outer string with backslash-escaped
inner double quotes.

Both ingest paths are idempotent: they delete every existing `knowledgeDocs` and
`knowledgeChunks` row for the lesson before inserting, so running them repeatedly
replaces rather than duplicates. Run `ingestFixture` twice and the search results are
unchanged.

## Notes / failure modes

- Missing key → `ingest` throws with the exact `npx convex env set` command to run.
  The key is read from `process.env.CONTEXT_DEV_API_KEY`, never hardcoded, never logged.
- Zero usable chunks from Context.dev → `ingest` throws *before* deleting anything, so
  a bad scrape cannot wipe working knowledge. Fall back to `ingestFixture`.
- `knowledge:search` returning `chunks: []` for a real question means nothing was
  ingested yet — run step 2 or step 3.
