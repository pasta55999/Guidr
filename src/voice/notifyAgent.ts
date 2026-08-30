import { ELEMENT_REGISTRY, type TutorElementId } from "../contracts/elements";
import type { RecordClickResult } from "../contracts/session";
import type { SendEvent } from "./toolDispatcher";

// The reverse channel: deterministic application state -> model.
//
// This is how "learner clicked the right thing" reaches the tutor. It is NOT a
// tool: the model cannot invoke it, it can only receive it. That asymmetry is
// what stops the model from ever declaring success on its own.

const PREFIX = "[LESSON_STATE]";

function labelOf(elementId: string): string {
  return elementId in ELEMENT_REGISTRY
    ? ELEMENT_REGISTRY[elementId as TutorElementId].labelEn
    : elementId;
}

export function buildStateMessage(
  result: RecordClickResult,
  clickedElementId: string,
  totalSteps: number,
  expectedElementId: string | null,
): string {
  if (result.outcome === "wrong") {
    return (
      `${PREFIX} wrong_action: the learner interacted with "${clickedElementId}" ` +
      `(${labelOf(clickedElementId)}), but step ${result.currentStepIndex + 1} expects ` +
      `"${expectedElementId ?? "unknown"}". The step did NOT advance. Briefly say what ` +
      `that control actually does, then point at the correct one again. Stay kind.`
    );
  }

  if (result.lessonCompleted) {
    return (
      `${PREFIX} lesson_completed: the learner correctly used "${clickedElementId}" and ` +
      `finished all ${totalSteps} steps. Congratulate them warmly and briefly, in their ` +
      `language, and stop. Do not start a new lesson.`
    );
  }

  const next = result.nextStep;
  return (
    `${PREFIX} correct_action: the learner correctly used "${clickedElementId}". ` +
    `Step ${result.previousStepIndex + 1} is complete. They are now on step ` +
    `${result.currentStepIndex + 1} of ${totalSteps}` +
    (next
      ? `: ${next.titleEn} (target elementId: "${next.elementId}").`
      : `.`) +
    ` Acknowledge briefly, then teach this step and highlight its element.`
  );
}

/** Push a state update and ask the tutor to speak about it. */
export function notifyAgent(send: SendEvent, text: string): void {
  send({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text }],
    },
  });
  send({ type: "response.create" });
}

/** Sent right after (re)connecting so the tutor resumes at the persisted step. */
export function buildResumeMessage(
  stepIndex: number,
  totalSteps: number,
  stepTitleEn: string,
  targetElementId: string | null,
  lessonCompleted: boolean,
): string {
  if (lessonCompleted) {
    return `${PREFIX} resumed: this learner has already completed all ${totalSteps} steps. Congratulate them briefly and do not re-teach.`;
  }
  return (
    `${PREFIX} resumed: the learner is on step ${stepIndex + 1} of ${totalSteps}: ` +
    `${stepTitleEn} (target elementId: "${targetElementId ?? "unknown"}"). ` +
    `Greet them briefly and teach this step now, highlighting its element. ` +
    `Do not re-teach earlier steps.`
  );
}
