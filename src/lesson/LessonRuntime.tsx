import { useCallback, useEffect, useRef } from "react";
import { InvoiceApp } from "../app/InvoiceApp";
import { HighlightOverlay } from "../overlay/HighlightOverlay";
import { useHighlight } from "../overlay/HighlightProvider";
import { MicButton } from "../ui/MicButton";
import { StatusPill } from "../ui/StatusPill";
import { StepTracker } from "../ui/StepTracker";
import { VoiceProvider, useVoice } from "../voice/VoiceProvider";
import { buildResumeMessage, buildStateMessage } from "../voice/notifyAgent";
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

  // The opening turn carries the persisted step, so a refresh mid-lesson
  // resumes instead of restarting.
  const buildOpeningMessage = useCallback(() => {
    const current = snapshotRef.current;
    if (!current) return null;
    return buildResumeMessage(
      current.stepIndex,
      current.totalSteps,
      current.stepTitleEn,
      current.targetElementId,
      current.lessonCompleted,
    );
  }, []);

  return (
    <VoiceProvider handlers={handlers} buildOpeningMessage={buildOpeningMessage}>
      <LessonStage
        snapshot={snapshot}
        sessionId={sessionId}
        start={start}
        submitAction={submitAction}
      />
    </VoiceProvider>
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
  const voice = useVoice();
  const { clear } = useHighlight();
  const creatingRef = useRef(false);

  // Prepare the durable lesson state as soon as the page loads.
  // This does not start the microphone or make the tutor speak.
  // Voice remains idle and the browser asks for microphone permission only after
  // the learner clicks the talk button.
  useEffect(() => {
    if (sessionId || creatingRef.current) return;
    creatingRef.current = true;
    void start().finally(() => {
      creatingRef.current = false;
    });
  }, [sessionId, start]);

  // A Convex session must exist before push-to-talk can be enabled.
  // Voice is started only by the button click, never by an effect.
  const micEnabled = Boolean(sessionId && snapshot);

  /**
   * THE DETERMINISTIC LOOP.
   * Learner acts -> Convex judges and persists -> the tutor is TOLD the result.
   * The tutor is never asked whether the learner was right.
   */
  const handleTutorAction = useCallback(
    async (elementId: TutorElementId, value?: string) => {
      const expected = snapshot?.targetElementId ?? null;
      const total = snapshot?.totalSteps ?? 5;

      const result = await submitAction(elementId, value);
      if (!result || result.outcome === "already_done") return;
      if (result.outcome === "correct") clear();

      await voice.sendUserText(
        buildStateMessage(result, elementId, total, expected),
        { visible: false },
      );
    },
    [snapshot, submitAction, clear, voice],
  );

  const active = voice.status !== "idle" && voice.status !== "error";

  return (
    <div className="lr-root">
      <header className="lr-bar">
        <div className="lr-bar-left">
          <StepTracker
            stepIndex={snapshot?.stepIndex ?? 0}
            totalSteps={snapshot?.totalSteps ?? 5}
            stepTitleEn={snapshot?.stepTitleEn ?? "Preparing your lesson…"}
            stepTitleAr={snapshot?.stepTitleAr ?? ""}
            lessonCompleted={snapshot?.lessonCompleted ?? false}
          />
        </div>
        <div className="lr-bar-right">
          {voice.usingFallbackStt && (
            <span className="lr-note" title="Munsit unavailable — using the browser engine">
              fallback STT
            </span>
          )}
          <span
            className="lr-lang"
            title="Detected from your speech; the tutor is told this explicitly every turn"
          >
            {voice.learnerLanguage === "ar"
              ? "العربية"
              : voice.learnerLanguage === "mixed"
                ? "عربي + EN"
                : "English"}
          </span>
          <StatusPill status={voice.status} />
          <MicButton
            status={voice.status}
            micEnabled={micEnabled}
            onStart={() => void voice.start()}
          />
        </div>
      </header>

      {voice.audioBlocked && (
        <button type="button" className="lr-unlock" onClick={voice.unlockAudio}>
          Click once to allow the tutor's voice — your browser blocked autoplay
        </button>
      )}

      {voice.error && <div className="lr-error">{voice.error}</div>}

      {active && (
        <div
          className={`lr-interrupt${voice.interruptHeld ? " is-held" : ""}`}
          role="status"
          aria-live="polite"
        >
          {voice.interruptHeld ? (
            <strong>Listening — release the keys to send</strong>
          ) : (
            <span>
              Hold <kbd>Ctrl</kbd> + <kbd>Space</kbd> to interrupt the tutor
            </span>
          )}
        </div>
      )}

      <main className="lr-stage">
        <InvoiceApp onTutorAction={handleTutorAction} />
      </main>

      {active && (
        <div className="lr-level" aria-hidden="true">
          <span style={{ width: `${Math.round(voice.level * 100)}%` }} />
        </div>
      )}

      <HighlightOverlay />
    </div>
  );
}
