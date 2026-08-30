// FROZEN after Phase 1. Shared shapes between Convex, the voice layer and the UI.

import type { TutorElementId } from "./elements.data";

export type LessonLanguage = "en" | "ar" | "mixed";

/** Reactive projection of durable progress. Read from Convex, never from React state. */
export interface LessonStateSnapshot {
  sessionId: string;
  lessonTitleEn: string;
  lessonTitleAr: string;
  appName: string;
  stepIndex: number;
  totalSteps: number;
  stepTitleEn: string;
  stepTitleAr: string;
  instructionEn: string;
  instructionAr: string;
  hintEn: string;
  hintAr: string;
  targetElementId: TutorElementId | null;
  wrongClicks: number;
  hintsUsed: number;
  lessonCompleted: boolean;
}

/** Result of the deterministic click judgement in convex/sessions.ts. */
export interface RecordClickResult {
  outcome: "correct" | "wrong" | "already_done";
  previousStepIndex: number;
  currentStepIndex: number;
  lessonCompleted: boolean;
  nextStep: {
    index: number;
    elementId: TutorElementId;
    titleEn: string;
    titleAr: string;
  } | null;
}

export type TutorStatus =
  | "idle"
  | "requesting-token"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

export interface HighlightState {
  elementId: TutorElementId | null;
  style: "pulse" | "cursor";
}
