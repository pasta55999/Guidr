// FROZEN after Phase 1. The bridge between LLM reasoning and app capability.
//
// Note what is absent: there is no advance_step tool. Lesson progress is decided
// only by convex/sessions.ts:recordClick. The tutor can point and explain; it
// cannot declare success. No tool schema accepts a number that could be a
// coordinate.

import type { HighlightableElementId } from "./elements.data";
import type { LessonStateSnapshot } from "./session";

export const TOOL_NAMES = [
  "highlight_element",
  "clear_highlight",
  "get_lesson_state",
  "lookup_docs",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolArgs {
  highlight_element: {
    elementId: HighlightableElementId;
    style?: "pulse" | "cursor";
  };
  clear_highlight: Record<string, never>;
  get_lesson_state: Record<string, never>;
  lookup_docs: { query: string };
}

export interface ToolResults {
  highlight_element: {
    ok: boolean;
    found: boolean;
    labelEn: string;
    labelAr: string;
    isCurrentStepTarget: boolean;
    note?: string;
  };
  clear_highlight: { ok: boolean };
  get_lesson_state: LessonStateSnapshot | { ok: false; error: string };
  lookup_docs: {
    ok: boolean;
    sourceUrl: string | null;
    chunks: Array<{ heading: string; text: string }>;
  };
}

export type ToolHandler<N extends ToolName = ToolName> = (
  args: ToolArgs[N],
) => Promise<ToolResults[N]>;

export type ToolHandlerMap = {
  [N in ToolName]: ToolHandler<N>;
};

/** Shape of a failed dispatch. Always returned, never thrown, so the model never stalls. */
export interface ToolErrorResult {
  ok: false;
  error: string;
}
