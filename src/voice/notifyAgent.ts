import { ELEMENT_REGISTRY, type TutorElementId } from "../contracts/elements";
import type { RecordClickResult } from "../contracts/session";

// The reverse channel: deterministic application state -> tutor.
//
// These strings are appended to the conversation as user-role messages. They are
// NOT a tool: the tutor cannot invoke them, it can only receive them. That
// asymmetry is what stops it from ever declaring success on its own.

const PREFIX = "[LESSON_STATE]";

export type LearnerLanguage = "en" | "ar" | "mixed";

/**
 * Every [LESSON_STATE] message is necessarily written in English, and those
 * English directives accumulate and drag the tutor's replies back to English.
 * So we detect the learner's language from their speech and state the
 * requirement explicitly on every turn rather than relying on inference.
 */
export function languageDirective(language: LearnerLanguage): string {
  switch (language) {
    case "ar":
      return (
        " The learner is speaking ARABIC. Reply in Arabic only. This instruction" +
        " is in English purely for your benefit — do not answer in English."
      );
    case "mixed":
      return (
        " The learner is mixing Arabic and English. Reply in the same mixed" +
        " Gulf-workplace style, mainly Arabic with English UI labels kept in" +
        " English. Do not answer in English only."
      );
    case "en":
      return " The learner is speaking ENGLISH. Reply in English.";
  }
}

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

/** Sent when the lesson starts or resumes, so the tutor picks up the persisted step. */
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
