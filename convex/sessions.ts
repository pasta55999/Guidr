import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getLessonBySlug, getStep } from "./lessons";
import { logEvent } from "./events";

const languageValidator = v.union(
  v.literal("en"),
  v.literal("ar"),
  v.literal("mixed"),
);

export const start = mutation({
  args: {
    slug: v.string(),
    language: v.optional(languageValidator),
    learnerLabel: v.optional(v.string()),
  },
  handler: async (ctx, { slug, language, learnerLabel }) => {
    const lesson = await getLessonBySlug(ctx.db, slug);
    if (!lesson) throw new Error(`Unknown lesson slug: ${slug}`);

    const sessionId = await ctx.db.insert("sessions", {
      lessonId: lesson._id,
      learnerLabel: learnerLabel ?? "Demo learner",
      currentStepIndex: 0,
      status: "active",
      language: language ?? "mixed",
      wrongClicks: 0,
      hintsUsed: 0,
      startedAt: Date.now(),
    });

    await logEvent(ctx.db, { sessionId, stepIndex: 0, type: "step_started" });
    return sessionId;
  },
});

/** Reactive projection of durable progress. Shape matches LessonStateSnapshot. */
export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const lesson = await ctx.db.get(session.lessonId);
    if (!lesson) return null;

    const completed = session.status === "completed";
    // On completion currentStepIndex sits past the end; fall back to the last step.
    const step =
      (await getStep(ctx.db, session.lessonId, session.currentStepIndex)) ??
      (await getStep(ctx.db, session.lessonId, lesson.stepCount - 1));

    return {
      sessionId,
      lessonTitleEn: lesson.title,
      lessonTitleAr: lesson.titleAr,
      appName: lesson.appName,
      stepIndex: session.currentStepIndex,
      totalSteps: lesson.stepCount,
      stepTitleEn: step?.titleEn ?? "",
      stepTitleAr: step?.titleAr ?? "",
      instructionEn: step?.instructionEn ?? "",
      instructionAr: step?.instructionAr ?? "",
      hintEn: step?.hintEn ?? "",
      hintAr: step?.hintAr ?? "",
      targetElementId: completed ? null : (step?.elementId ?? null),
      wrongClicks: session.wrongClicks,
      hintsUsed: session.hintsUsed,
      lessonCompleted: completed,
    };
  },
});

function meetsCompletionRule(
  step: Doc<"lessonSteps">,
  value: string | undefined,
): boolean {
  switch (step.completion.kind) {
    case "click":
      return true;
    case "select":
      return value === step.completion.expectedValue;
    case "input":
      return (value ?? "").trim().length >= step.completion.minLength;
  }
}

/**
 * THE DETERMINISTIC CORE.
 *
 * The only place lesson progress can change. The tutor LLM has no tool that
 * reaches this. Out-of-order or incorrect actions are logged and never advance
 * the step, and replaying a correct action is a no-op.
 */
export const recordClick = mutation({
  args: {
    sessionId: v.id("sessions"),
    elementId: v.string(),
    value: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, elementId, value }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Unknown session");

    const lesson = await ctx.db.get(session.lessonId);
    if (!lesson) throw new Error("Unknown lesson");

    const from = session.currentStepIndex;

    if (session.status === "completed") {
      return {
        outcome: "already_done" as const,
        previousStepIndex: from,
        currentStepIndex: from,
        lessonCompleted: true,
        nextStep: null,
      };
    }

    const step = await getStep(ctx.db, session.lessonId, from);
    const correct =
      step !== null &&
      step.elementId === elementId &&
      meetsCompletionRule(step, value);

    if (!correct) {
      await ctx.db.patch(sessionId, { wrongClicks: session.wrongClicks + 1 });
      await logEvent(ctx.db, {
        sessionId,
        stepIndex: from,
        type: "wrong_action",
        elementId,
        detail: `expected ${step?.elementId ?? "none"}`,
      });
      return {
        outcome: "wrong" as const,
        previousStepIndex: from,
        currentStepIndex: from,
        lessonCompleted: false,
        nextStep: null,
      };
    }

    await logEvent(ctx.db, {
      sessionId,
      stepIndex: from,
      type: "correct_action",
      elementId,
    });

    const to = from + 1;
    const done = to >= lesson.stepCount;

    await ctx.db.patch(sessionId, {
      currentStepIndex: to,
      ...(done ? { status: "completed" as const, completedAt: Date.now() } : {}),
    });

    if (done) {
      await logEvent(ctx.db, {
        sessionId,
        stepIndex: from,
        type: "lesson_completed",
      });
      return {
        outcome: "correct" as const,
        previousStepIndex: from,
        currentStepIndex: to,
        lessonCompleted: true,
        nextStep: null,
      };
    }

    const next = await getStep(ctx.db, session.lessonId, to);
    await logEvent(ctx.db, { sessionId, stepIndex: to, type: "step_started" });

    return {
      outcome: "correct" as const,
      previousStepIndex: from,
      currentStepIndex: to,
      lessonCompleted: false,
      nextStep: next
        ? {
            index: next.index,
            elementId: next.elementId,
            titleEn: next.titleEn,
            titleAr: next.titleAr,
          }
        : null,
    };
  },
});

export const recordHint = mutation({
  args: { sessionId: v.id("sessions"), detail: v.optional(v.string()) },
  handler: async (ctx, { sessionId, detail }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Unknown session");
    await ctx.db.patch(sessionId, { hintsUsed: session.hintsUsed + 1 });
    await logEvent(ctx.db, {
      sessionId,
      stepIndex: session.currentStepIndex,
      type: "hint_given",
      detail,
    });
  },
});

/** Logged when the tutor grounds an answer in the ingested FTA guidance. */
export const recordDocLookup = mutation({
  args: { sessionId: v.id("sessions"), query: v.string() },
  handler: async (ctx, { sessionId, query }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return;
    await logEvent(ctx.db, {
      sessionId,
      stepIndex: session.currentStepIndex,
      type: "doc_lookup",
      detail: query.slice(0, 200),
    });
  },
});

/** Used by the token endpoint to refuse minting for unknown sessions. */
export const exists = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    return session !== null && session.status === "active";
  },
});
