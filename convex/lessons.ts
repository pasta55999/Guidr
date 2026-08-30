import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";

export async function getLessonBySlug(
  db: DatabaseReader,
  slug: string,
): Promise<Doc<"lessons"> | null> {
  return await db
    .query("lessons")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export async function getStep(
  db: DatabaseReader,
  lessonId: Id<"lessons">,
  index: number,
): Promise<Doc<"lessonSteps"> | null> {
  return await db
    .query("lessonSteps")
    .withIndex("by_lesson_index", (q) =>
      q.eq("lessonId", lessonId).eq("index", index),
    )
    .unique();
}

export async function listSteps(
  db: DatabaseReader,
  lessonId: Id<"lessons">,
): Promise<Doc<"lessonSteps">[]> {
  return await db
    .query("lessonSteps")
    .withIndex("by_lesson_index", (q) => q.eq("lessonId", lessonId))
    .order("asc")
    .collect();
}

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const lesson = await getLessonBySlug(ctx.db, slug);
    if (!lesson) return null;
    return { lesson, steps: await listSteps(ctx.db, lesson._id) };
  },
});
