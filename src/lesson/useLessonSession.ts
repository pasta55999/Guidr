import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { LessonStateSnapshot, RecordClickResult } from "../contracts/session";
import type { TutorElementId } from "../contracts/elements";

const SLUG = "create-supplier-invoice";
const STORAGE_KEY = "clicky-uae.sessionId";

/**
 * Owns the durable session. Progress is read straight from Convex — it is never
 * mirrored into React state — so a refresh resumes exactly where the learner was.
 */
export function useLessonSession() {
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const startSession = useMutation(api.sessions.start);
  const recordClick = useMutation(api.sessions.recordClick);

  const snapshot = useQuery(
    api.sessions.get,
    sessionId ? { sessionId: sessionId as Id<"sessions"> } : "skip",
  ) as LessonStateSnapshot | null | undefined;

  // A stored id can outlive its deployment (e.g. the local backend was reset).
  useEffect(() => {
    if (sessionId && snapshot === null) {
      localStorage.removeItem(STORAGE_KEY);
      setSessionId(null);
    }
  }, [sessionId, snapshot]);

  const start = useCallback(async () => {
    const id = await startSession({ slug: SLUG, language: "mixed" });
    localStorage.setItem(STORAGE_KEY, id);
    setSessionId(id);
    return id;
  }, [startSession]);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessionId(null);
  }, []);

  const submitAction = useCallback(
    async (
      elementId: TutorElementId,
      value?: string,
    ): Promise<RecordClickResult | null> => {
      if (!sessionId) return null;
      return (await recordClick({
        sessionId: sessionId as Id<"sessions">,
        elementId,
        value,
      })) as RecordClickResult;
    },
    [sessionId, recordClick],
  );

  return {
    sessionId,
    snapshot: snapshot ?? null,
    loading: sessionId !== null && snapshot === undefined,
    start,
    reset,
    submitAction,
  };
}
