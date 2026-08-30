// Turns a semantic element id into on-screen pixels.
//
// Everything is position: fixed and pointer-events: none on EVERY layer, so the
// overlay can never swallow a click. It works purely off measured rects, which
// makes it direction-agnostic (identical behaviour under dir="rtl").

import { useEffect, useRef, useState } from "react";
import { ELEMENT_REGISTRY } from "../contracts/elements";
import { useHighlight } from "./HighlightProvider";
import { useElementRect } from "./useElementRect";
import "./overlay.css";

/** Keep in sync with the transition duration below. */
const TRAVEL_MS = 520;
const RING_PAD = 8;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

interface CursorPos {
  x: number;
  y: number;
  travelling: boolean;
}

export function HighlightOverlay() {
  const { state } = useHighlight();
  const rect = useElementRect(state.elementId);
  const reducedMotion = usePrefersReducedMotion();

  const targetX = rect ? rect.left + rect.width / 2 : null;
  const targetY = rect ? rect.top + rect.height / 2 : null;

  // Last painted cursor position survives clears, so consecutive highlights
  // ease from where the cursor actually was rather than from the origin.
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const lastId = useRef<string | null>(null);
  /** Was the cursor layer in the DOM on the previous commit? */
  const wasMounted = useRef(false);
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const [clickKey, setClickKey] = useState(0);

  useEffect(() => {
    if (state.elementId === null) lastId.current = null;
  }, [state.elementId]);

  useEffect(() => {
    if (targetX === null || targetY === null) return;

    const isNewTarget = lastId.current !== state.elementId;
    const from = lastPos.current;
    lastId.current = state.elementId;
    lastPos.current = { x: targetX, y: targetY };

    // Same target, just re-measured (scroll/resize): snap, don't chase, and
    // don't re-fire the click ripple.
    if (!isNewTarget) {
      setCursor({ x: targetX, y: targetY, travelling: false });
      return;
    }

    // Nothing to travel from, or motion is unwelcome: appear on the target.
    if (from === null || reducedMotion) {
      setCursor({ x: targetX, y: targetY, travelling: false });
      setClickKey((k) => k + 1);
      return;
    }

    if (wasMounted.current) {
      setCursor({ x: targetX, y: targetY, travelling: true });
      setClickKey((k) => k + 1);
      return;
    }

    // Cursor was unmounted (previous highlight was cleared): paint at the old
    // position first, then transition, so travel still starts from where the
    // learner last saw the pointer.
    setCursor({ x: from.x, y: from.y, travelling: false });
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setCursor({ x: targetX, y: targetY, travelling: true });
        setClickKey((k) => k + 1);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [targetX, targetY, state.elementId, reducedMotion]);

  // Runs after the effect above, so during that effect the ref still describes
  // the previous commit.
  useEffect(() => {
    wasMounted.current =
      state.elementId !== null && rect !== null && state.style === "cursor";
  });

  if (!state.elementId || !rect) return null;

  const meta = ELEMENT_REGISTRY[state.elementId];
  const showCursor = state.style === "cursor" && cursor !== null;
  const rippleDelay = cursor?.travelling ? `${TRAVEL_MS}ms` : "0ms";

  return (
    <div className="ov-root" aria-hidden="true" data-overlay-root="">
      <div
        className={`ov-ring ov-ring--${state.style}`}
        style={{
          left: rect.left - RING_PAD,
          top: rect.top - RING_PAD,
          width: rect.width + RING_PAD * 2,
          height: rect.height + RING_PAD * 2,
        }}
      >
        <span className="ov-ring-label">{meta.labelEn}</span>
      </div>

      {showCursor && cursor && (
        <div
          className="ov-cursor"
          style={{
            transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
            transition: cursor.travelling
              ? `transform ${TRAVEL_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
              : "none",
          }}
        >
          <span
            key={clickKey}
            className="ov-ripple"
            style={{ animationDelay: rippleDelay }}
          />
          <svg
            className="ov-pointer"
            viewBox="0 0 24 24"
            width="26"
            height="26"
            focusable="false"
          >
            <path
              d="M4 2.5 19 12l-6.4 1.1L9.9 19.4z"
              fill="#111827"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export default HighlightOverlay;
