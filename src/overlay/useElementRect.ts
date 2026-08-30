// Semantic id -> live DOMRect. The only place the overlay learns about pixels.
//
// Stays correct while things move: ResizeObserver on the element, capture-phase
// window scroll (so scrolling inside nested containers counts), window resize,
// and a childList MutationObserver so an element that mounts later (a dropdown
// option) is picked up. Event-driven re-measures are coalesced into a
// requestAnimationFrame, so we never read a rect in the same frame the DOM
// changed; the first measure runs in a layout effect (post-commit, pre-paint) so
// a fresh highlight never flickers.

import { useLayoutEffect, useState } from "react";
import { findTutorElement, type TutorElementId } from "../contracts/elements";

interface Measurement {
  id: TutorElementId | null;
  rect: DOMRect | null;
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

export function useElementRect(id: TutorElementId | null): DOMRect | null {
  const [measured, setMeasured] = useState<Measurement>({
    id: null,
    rect: null,
  });

  useLayoutEffect(() => {
    if (!id) {
      setMeasured({ id: null, rect: null });
      return;
    }

    let frame = 0;
    let disposed = false;
    let observed: HTMLElement | null = null;

    const measure = () => {
      frame = 0;
      if (disposed) return;
      const el = findTutorElement(id);

      if (el !== observed) {
        if (observed) resizeObserver.unobserve(observed);
        if (el) resizeObserver.observe(el);
        observed = el;
      }

      // Not mounted right now (e.g. an option while its menu is closed):
      // report null instead of throwing, and keep watching in case it appears.
      const next = el ? el.getBoundingClientRect() : null;
      setMeasured((prev) =>
        prev.id === id && sameRect(prev.rect, next) ? prev : { id, rect: next },
      );
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(schedule);
    const mutationObserver = new MutationObserver(schedule);

    measure();
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      disposed = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [id]);

  // Never hand back a rect that belongs to a previous element id.
  return measured.id === id ? measured.rect : null;
}
