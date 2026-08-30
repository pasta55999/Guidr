import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// FROZEN after Phase 1. Changing this file invalidates every parallel workstream.

// How a step is deterministically judged complete. The tutor LLM never decides this.
const completionRule = v.union(
  v.object({ kind: v.literal("click") }),
  v.object({ kind: v.literal("select"), expectedValue: v.string() }),
  v.object({ kind: v.literal("input"), minLength: v.number() }),
);

export default defineSchema({
  lessons: defineTable({
    slug: v.string(),
    title: v.string(),
    titleAr: v.string(),
    appName: v.string(),
    docSourceUrl: v.string(),
    stepCount: v.number(),
  }).index("by_slug", ["slug"]),

  lessonSteps: defineTable({
    lessonId: v.id("lessons"),
    index: v.number(),
    // Must be a TutorElementId from src/contracts/elements.ts
    elementId: v.string(),
    titleEn: v.string(),
    titleAr: v.string(),
    instructionEn: v.string(),
    instructionAr: v.string(),
    hintEn: v.string(),
    hintAr: v.string(),
    completion: completionRule,
  }).index("by_lesson_index", ["lessonId", "index"]),

  sessions: defineTable({
    lessonId: v.id("lessons"),
    learnerLabel: v.string(),
    currentStepIndex: v.number(),
    status: v.union(v.literal("active"), v.literal("completed")),
    language: v.union(v.literal("en"), v.literal("ar"), v.literal("mixed")),
    wrongClicks: v.number(),
    hintsUsed: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }),

  sessionEvents: defineTable({
    sessionId: v.id("sessions"),
    stepIndex: v.number(),
    type: v.union(
      v.literal("step_started"),
      v.literal("correct_action"),
      v.literal("wrong_action"),
      v.literal("hint_given"),
      v.literal("doc_lookup"),
      v.literal("lesson_completed"),
    ),
    elementId: v.optional(v.string()),
    detail: v.optional(v.string()),
    at: v.number(),
  }).index("by_session", ["sessionId"]),

  knowledgeDocs: defineTable({
    lessonId: v.id("lessons"),
    sourceUrl: v.string(),
    title: v.string(),
    provider: v.literal("context.dev"),
    markdown: v.string(),
    fetchedAt: v.number(),
    creditsConsumed: v.optional(v.number()),
  }).index("by_lesson", ["lessonId"]),

  knowledgeChunks: defineTable({
    lessonId: v.id("lessons"),
    docId: v.id("knowledgeDocs"),
    heading: v.string(),
    text: v.string(),
    keywords: v.array(v.string()),
    relatedStepIndex: v.optional(v.number()),
  }).index("by_lesson", ["lessonId"]),
});
