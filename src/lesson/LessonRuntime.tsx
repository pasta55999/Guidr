import { useCallback, useEffect, useRef, useState } from "react";
import { InvoiceApp } from "../app/InvoiceApp";
import { HighlightOverlay } from "../overlay/HighlightOverlay";
import { useHighlight } from "../overlay/HighlightProvider";
import { MicButton } from "../ui/MicButton";
import { StatusPill } from "../ui/StatusPill";
import { StepTracker } from "../ui/StepTracker";
import { RealtimeProvider, useRealtime } from "../voice/RealtimeProvider";
import {
  buildResumeMessage,
  buildStateMessage,
  notifyAgent,
} from "../voice/notifyAgent";
import type { TutorElementId } from "../contracts/elements";
import type { LessonStateSnapshot } from "../contracts/session";
import { useLessonSession } from "./useLessonSession";
import { useToolHandlers } from "./useToolHandlers";
import "./lesson.css";

export function LessonRuntime() {
  const { sessionId, snapshot, start, submitAction } = useLessonSession();
  const { highlight, clear } = useHighlight();
  const handlers = useToolHandlers({ sessionId, snapshot, highlight, clear });

  const snapshotRef = useRef<LessonStateSnapshot | null>(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  // On (re)connect, tell the tutor the persisted step so a refresh mid-lesson
  // resumes instead of restarting.
  const onConnected = useCallback(
    (send: (event: Record<string, unknown>) => void) => {
      const current = snapshotRef.current;
      if (!current) return;
      notifyAgent(
        send,
        buildResumeMessage(
          current.stepIndex,
          current.totalSteps,
          current.stepTitleEn,
          current.targetElementId,
          current.lessonCompleted,
        ),
      );
    },
    [],
  );

  return (
    <RealtimeProvider
      sessionId={sessionId}
      handlers={handlers}
      onConnected={onConnected}
    >
      <LessonStage
        snapshot={snapshot}
        sessionId={sessionId}
        start={start}
        submitAction={submitAction}
      />
    </RealtimeProvider>
  );
}

interface LessonStageProps {
  snapshot: LessonStateSnapshot | null;
  sessionId: string | null;
  start: () => Promise<string>;
  submitAction: ReturnType<typeof useLessonSession>["submitAction"];
}

function LessonStage({
  snapshot,
  sessionId,
  start,
  submitAction,
}: LessonStageProps) {
  const { status, micEnabled, setMicEnabled, connect, disconnect, send } =
    useRealtime();
  const { clear } = useHighlight();
  const [pendingStart, setPendingStart] = useState(false);

  // A session must exist before a token can be minted, so starting is two
  // steps: create the Convex session, then connect once its id has propagated.
  useEffect(() => {
    if (pendingStart && sessionId && status === "idle") {
      setPendingStart(false);
      void connect();
    }
  }, [pendingStart, sessionId, status, connect]);

  const handleStart = useCallback(async () => {
    if (!sessionId) await start();
    setPendingStart(true);
  }, [sessionId, start]);

  /**
   * THE DETERMINISTIC LOOP.
   * Learner acts -> Convex judges and persists -> the tutor is TOLD the result.
   * The model is never asked whether the learner was right.
   */
  const handleTutorAction = useCallback(
    async (elementId: TutorElementId, value?: string) => {
      const expected = snapshot?.targetElementId ?? null;
      const total = snapshot?.totalSteps ?? 5;

      const result = await submitAction(elementId, value);
      if (!result) return;

      if (result.outcome === "already_done") return;
      if (result.outcome === "correct") clear();

      notifyAgent(
        send,
        buildStateMessage(result, elementId, total, expected),
      );
    },
    [snapshot, submitAction, send, clear],
  );

  const live = status === "live" || status === "reconnecting";

  return (
    <div className="lr-root">
      <header className="lr-bar">
        <div className="lr-bar-left">
          <StepTracker
            stepIndex={snapshot?.stepIndex ?? 0}
            totalSteps={snapshot?.totalSteps ?? 5}
            stepTitleEn={snapshot?.stepTitleEn ?? "Press Start to begin"}
            stepTitleAr={snapshot?.stepTitleAr ?? ""}
            lessonCompleted={snapshot?.lessonCompleted ?? false}
          />
        </div>
        <div className="lr-bar-right">
          <StatusPill status={status} />
          <MicButton
            status={status}
            micEnabled={micEnabled}
            onStart={() => {
              if (!live) void handleStart();
              else setMicEnabled(!micEnabled);
            }}
            onStop={disconnect}
          />
        </div>
      </header>

      <main className="lr-stage">
        <InvoiceApp onTutorAction={handleTutorAction} />
      </main>

      <HighlightOverlay />
    </div>
  );
}
