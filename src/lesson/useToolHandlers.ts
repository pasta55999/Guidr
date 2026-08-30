import { useEffect, useMemo, useRef } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ELEMENT_REGISTRY,
  findTutorElement,
  isHighlightableElementId,
  type HighlightableElementId,
} from "../contracts/elements";
import type { LessonStateSnapshot } from "../contracts/session";
import type { ToolHandlerMap } from "../contracts/tools";

export interface UseToolHandlersArgs {
  sessionId: string | null;
  /** Latest Convex snapshot. Reactive, so the model always reads real progress. */
  snapshot: LessonStateSnapshot | null;
  highlight: (elementId: HighlightableElementId, style?: "pulse" | "cursor") => void;
  clear: () => void;
}

/**
 * Builds the bridge from LLM reasoning to app capability.
 *
 * Note what these handlers can and cannot do: they can point at things, read
 * state and read documentation. None of them can advance the lesson — that is
 * only ever `sessions.recordClick`, driven by a real learner action.
 */
export function useToolHandlers({
  sessionId,
  snapshot,
  highlight,
  clear,
}: UseToolHandlersArgs): ToolHandlerMap {
  const convex = useConvex();
  const recordDocLookup = useMutation(api.sessions.recordDocLookup);

  // Handlers are captured once by the voice layer, so read mutable inputs
  // through refs to avoid serving the model stale progress.
  const snapshotRef = useRef(snapshot);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    snapshotRef.current = snapshot;
    sessionIdRef.current = sessionId;
  }, [snapshot, sessionId]);

  return useMemo<ToolHandlerMap>(
    () => ({
      highlight_element: async ({ elementId, style }) => {
        if (!isHighlightableElementId(elementId)) {
          return {
            ok: false,
            found: false,
            labelEn: "",
            labelAr: "",
            isCurrentStepTarget: false,
            note: `Unknown elementId: ${elementId}`,
          };
        }

        const meta = ELEMENT_REGISTRY[elementId];
        const found = findTutorElement(elementId) !== null;
        if (found) highlight(elementId, style);

        return {
          ok: true,
          found,
          labelEn: meta.labelEn,
          labelAr: meta.labelAr,
          isCurrentStepTarget: snapshotRef.current?.targetElementId === elementId,
          note: found
            ? undefined
            : "Not on screen yet — the learner probably needs to open a menu first.",
        };
      },

      clear_highlight: async () => {
        clear();
        return { ok: true };
      },

      get_lesson_state: async () => {
        const current = snapshotRef.current;
        return current ?? { ok: false as const, error: "No active session" };
      },

      lookup_docs: async ({ query }) => {
        const result = await convex.query(api.knowledge.search, { query });
        const id = sessionIdRef.current;
        if (id && result.chunks.length > 0) {
          // Fire-and-forget: never make the model wait on an audit write.
          void recordDocLookup({ sessionId: id as Id<"sessions">, query });
        }
        return result;
      },
    }),
    [convex, recordDocLookup, highlight, clear],
  );
}
