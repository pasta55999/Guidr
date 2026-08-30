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
  if (next?.elementId === "submit-invoice-button") {
    return (
      `${PREFIX} correct_action: the learner correctly used "${clickedElementId}". ` +
      `Step ${result.previousStepIndex + 1} is complete. They are now on step ` +
      `${result.currentStepIndex + 1} of ${totalSteps}: ${next.titleEn} ` +
      `(target elementId: "${next.elementId}"). This action submits financial data. ` +
      `Acknowledge briefly, then read back the planned supplier, Al Masa Trading LLC, and ` +
      `planned amount, AED 1,250. You do not receive the description text, so ask them to ` +
      `verify the description they entered and never invent it. Ask one clear verbal question ` +
      `confirming everything looks right, then STOP. Do not tell them to click Submit Invoice ` +
      `and do not call highlight_element yet. Only after a later clear yes may you teach and ` +
      `highlight the submit action.`
    );
  }

  return (
    `${PREFIX} correct_action: the learner correctly used "${clickedElementId}". ` +
    `Step ${result.previousStepIndex + 1} is complete. They are now on step ` +
    `${result.currentStepIndex + 1} of ${totalSteps}` +
    (next
      ? `: ${next.titleEn} (target elementId: "${next.elementId}").`
      : `.`) +
    ` Acknowledge briefly, then teach this step using action, meaning and reason, and ` +
    `highlight its element.`
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
    return (
      `${PREFIX} resumed: this learner has already completed all ${totalSteps} steps. ` +
      `Do not replay the dashboard introduction or re-teach the lesson. Answer their latest ` +
      `utterance directly; if they are only returning to the lesson, congratulate them briefly.`
    );
  }

  const currentStep =
    `step ${stepIndex + 1} of ${totalSteps}: ${stepTitleEn} ` +
    `(target elementId: "${targetElementId ?? "unknown"}")`;

  if (stepIndex === 0) {
    return (
      `${PREFIX} conversation_opened: this is the opening turn for Guidr on the Nexus ` +
      `Finance dashboard. The learner is Layla, a Finance Assistant working in Accounts ` +
      `Payable in Dubai. Say this dashboard-specific introduction: "Hey Layla — I'm Guidr. ` +
      `Your team set me up to help you get comfortable with Nexus Finance, where supplier ` +
      `invoices, approvals, payments and reports live in one dashboard. I know you work in ` +
      `Accounts Payable, so I'll keep this relevant." Then respond to the learner's latest ` +
      `utterance. If they already named what they need, do not ask them again; answer or ` +
      `begin ${currentStep} using action, meaning and reason, then highlight it. If they ` +
      `have not named a task, add: "Ask me about anything on this dashboard — I'll explain ` +
      `what it does, why it matters, and guide you from there. What are you working on?" ` +
      `Never ask for their identity or whether they are ready.`
    );
  }

  if (targetElementId === "submit-invoice-button") {
    return (
      `${PREFIX} resumed: the learner is on ${currentStep}. Do not replay the full dashboard ` +
      `introduction. Answer their latest utterance first. Before teaching this consequential ` +
      `step, read back only the known details: Al Masa Trading LLC, AED 1,250, and the ` +
      `description they entered. Ask one clear verbal question confirming everything looks ` +
      `right, then STOP. Do not tell them to click or call highlight_element until a later ` +
      `clear yes. Do not re-teach earlier steps.`
    );
  }

  return (
    `${PREFIX} resumed: the learner is on ${currentStep}. Do not replay the full dashboard ` +
    `introduction. Answer their latest utterance first. If they want to continue the invoice ` +
    `lesson, briefly welcome them back, teach this step using action, meaning and reason, and ` +
    `highlight its element. Do not re-teach earlier steps.`
  );
}
