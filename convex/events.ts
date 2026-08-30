import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";

export type EventType = Doc<"sessionEvents">["type"];

/**
 * Plain helper (not a mutation) so callers log inside their own transaction
 * instead of paying for an extra round trip.
 */
export async function logEvent(
  db: DatabaseWriter,
  args: {
    sessionId: Id<"sessions">;
    stepIndex: number;
    type: EventType;
    elementId?: string;
    detail?: string;
  },
): Promise<void> {
  await db.insert("sessionEvents", { ...args, at: Date.now() });
}

/** Demo side panel: the audit trail that proves Convex is the system of record. */
export const timeline = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("sessionEvents")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(50);
  },
});
