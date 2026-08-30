// FROZEN after Phase 1. Browser-only helpers over the element registry.
//
// The tutor LLM refers to elements by semantic ID only; it never produces x/y
// coordinates. These helpers are the sole place a semantic ID becomes a real
// DOM node and a real rect.

import {
  ELEMENT_REGISTRY,
  TUTOR_ATTR,
  isTutorElementId,
  type TutorElementId,
} from "./elements.data";

export * from "./elements.data";

/** Resolve a semantic ID to its live DOM node, or null if not currently mounted. */
export function findTutorElement(id: TutorElementId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${TUTOR_ATTR}="${id}"]`);
}

/**
 * Walk up from a click target to the nearest tagged ancestor. Clicks on
 * untagged chrome return null and are ignored entirely, rather than being
 * recorded as wrong answers.
 */
export function resolveClickedElementId(
  target: EventTarget | null,
): TutorElementId | null {
  if (!(target instanceof Element)) return null;
  const node = target.closest(`[${TUTOR_ATTR}]`);
  const id = node?.getAttribute(TUTOR_ATTR);
  return id && isTutorElementId(id) ? id : null;
}

/**
 * Dev-only drift check between the registry and the rendered app.
 * `skip` covers IDs that are legitimately unmounted at rest, e.g. dropdown
 * options that only exist while the menu is open.
 */
export function assertRegistryMounted(
  skip: readonly TutorElementId[] = ["supplier-option-al-masa"],
): void {
  if (!import.meta.env.DEV) return;
  const missing = (Object.keys(ELEMENT_REGISTRY) as TutorElementId[])
    .filter((id) => !skip.includes(id))
    .filter((id) => !findTutorElement(id));
  if (missing.length > 0) {
    console.warn(
      `[contracts] registry IDs with no mounted DOM node: ${missing.join(", ")}`,
    );
  }
}
