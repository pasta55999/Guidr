// FROZEN after Phase 1. Pure data + types, ZERO DOM and ZERO browser globals.
//
// This module is imported by BOTH the browser and Convex functions
// (convex/prompts.ts builds the tool enum from it), so it must stay runnable in
// Convex's V8 isolate. Put anything that touches `document` in elements.ts.

export type ElementRole = "target" | "decoy";

export interface ElementMeta {
  readonly labelEn: string;
  readonly labelAr: string;
  readonly role: ElementRole;
}

export const ELEMENT_REGISTRY = {
  "new-invoice-button": {
    labelEn: "New Invoice",
    labelAr: "فاتورة جديدة",
    role: "target",
  },
  "supplier-dropdown": {
    labelEn: "Supplier",
    labelAr: "المورّد",
    role: "target",
  },
  "supplier-option-al-masa": {
    labelEn: "Al Masa Trading LLC",
    labelAr: "شركة الماسة للتجارة",
    role: "target",
  },
  "amount-input": {
    labelEn: "Amount (AED)",
    labelAr: "المبلغ (درهم)",
    role: "target",
  },
  "description-input": {
    labelEn: "Description",
    labelAr: "الوصف",
    role: "target",
  },
  "submit-invoice-button": {
    labelEn: "Submit Invoice",
    labelAr: "إرسال الفاتورة",
    role: "target",
  },

  // Decoys: plausible controls, tagged so wrong clicks are detectable,
  // but never highlightable by the tutor.
  "tax-rate-field": {
    labelEn: "Tax Rate",
    labelAr: "نسبة الضريبة",
    role: "decoy",
  },
  "attachment-button": {
    labelEn: "Attach File",
    labelAr: "إرفاق ملف",
    role: "decoy",
  },
  "discard-button": {
    labelEn: "Discard",
    labelAr: "إلغاء",
    role: "decoy",
  },
} as const satisfies Record<string, ElementMeta>;

export type TutorElementId = keyof typeof ELEMENT_REGISTRY;

/** IDs the tutor is allowed to highlight (targets only). */
export type HighlightableElementId = {
  [K in TutorElementId]: (typeof ELEMENT_REGISTRY)[K]["role"] extends "target"
    ? K
    : never;
}[TutorElementId];

export const ALL_ELEMENT_IDS = Object.keys(
  ELEMENT_REGISTRY,
) as TutorElementId[];

export const HIGHLIGHTABLE_ELEMENT_IDS = ALL_ELEMENT_IDS.filter(
  (id) => ELEMENT_REGISTRY[id].role === "target",
) as HighlightableElementId[];

/** DOM attribute carrying the semantic ID. */
export const TUTOR_ATTR = "data-tutor-id";

export function isTutorElementId(value: string): value is TutorElementId {
  return Object.prototype.hasOwnProperty.call(ELEMENT_REGISTRY, value);
}

export function isHighlightableElementId(
  value: string,
): value is HighlightableElementId {
  return isTutorElementId(value) && ELEMENT_REGISTRY[value].role === "target";
}
