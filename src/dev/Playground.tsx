// OWNED BY THE UI/OVERLAY WORKSTREAM.
//
// Dev harness for the simulated app + highlight overlay, with no dependency on
// the voice session or Convex. Reachable at http://localhost:5173/?playground
//
// The UI components are fed FAKE props here on purpose: the real values come from
// a Convex query in Phase 3.

import { useCallback, useState } from "react";
import { InvoiceApp } from "../app/InvoiceApp";
import {
  assertRegistryMounted,
  ELEMENT_REGISTRY,
  findTutorElement,
  HIGHLIGHTABLE_ELEMENT_IDS,
  ALL_ELEMENT_IDS,
  type TutorElementId,
} from "../contracts/elements";
import type { TutorStatus } from "../contracts/session";
import { HighlightOverlay } from "../overlay/HighlightOverlay";
import {
  HighlightProvider,
  useHighlight,
  type HighlightStyle,
} from "../overlay/HighlightProvider";
import { MicButton } from "../ui/MicButton";
import { StatusPill } from "../ui/StatusPill";
import { StepTracker } from "../ui/StepTracker";
import "../ui/playground.css";

const FAKE_STEPS = [
  { en: "Open the new invoice form", ar: "افتح نموذج الفاتورة الجديدة" },
  { en: "Choose the supplier", ar: "اختر المورّد" },
  { en: "Enter the amount in AED", ar: "أدخل المبلغ بالدرهم" },
  { en: "Write the description", ar: "اكتب الوصف" },
  { en: "Submit the invoice", ar: "أرسل الفاتورة" },
];

const STATUSES: TutorStatus[] = [
  "idle",
  "starting",
  "listening",
  "thinking",
  "speaking",
  "error",
];

export default function Playground() {
  return (
    <HighlightProvider>
      <PlaygroundBody />
    </HighlightProvider>
  );
}

function PlaygroundBody() {
  const { state, highlight, clear } = useHighlight();
  const [style, setStyle] = useState<HighlightStyle>("cursor");
  const [rtl, setRtl] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<TutorStatus>("listening");
  const [log, setLog] = useState<string[]>([]);

  const push = useCallback((line: string) => {
    setLog((prev) => [line, ...prev].slice(0, 60));
  }, []);

  const onTutorAction = useCallback(
    (elementId: TutorElementId, value?: string) => {
      // Phase 3 replaces this with the Convex recordClick mutation. The UI layer
      // deliberately draws no conclusion about correctness.
      push(
        `action ${elementId}${value === undefined ? "" : ` = ${JSON.stringify(value)}`}`,
      );
    },
    [push],
  );

  const checkRegistry = useCallback(() => {
    assertRegistryMounted();
    const missing = ALL_ELEMENT_IDS.filter((id) => !findTutorElement(id));
    push(
      missing.length === 0
        ? "assertRegistryMounted(): all ids mounted"
        : `assertRegistryMounted(): missing ${missing.join(", ")}`,
    );
  }, [push]);

  const step = FAKE_STEPS[Math.min(stepIndex, FAKE_STEPS.length - 1)];
  const completed = stepIndex >= FAKE_STEPS.length;

  return (
    <div className="pg-root" dir={rtl ? "rtl" : "ltr"}>
      <aside className="pg-side">
        <div className="pg-panel">
          <div className="pg-row" style={{ justifyContent: "space-between" }}>
            <strong style={{ fontSize: 13 }}>Clicky-UAE · dev harness</strong>
            <StatusPill status={status} />
          </div>
        </div>

        <StepTracker
          stepIndex={Math.min(stepIndex, FAKE_STEPS.length - 1)}
          totalSteps={FAKE_STEPS.length}
          stepTitleEn={step.en}
          stepTitleAr={step.ar}
          lessonCompleted={completed}
        />

        <div className="pg-panel">
          <MicButton
            status={status}
            micEnabled
            onStart={() => setStatus("listening")}
            onStop={() => setStatus("idle")}
          />
        </div>

        <div className="pg-panel">
          <h3>Highlight (semantic ids only)</h3>
          <div className="pg-row">
            <button
              type="button"
              className={`pg-btn${style === "pulse" ? " is-on" : ""}`}
              onClick={() => setStyle("pulse")}
            >
              pulse
            </button>
            <button
              type="button"
              className={`pg-btn${style === "cursor" ? " is-on" : ""}`}
              onClick={() => setStyle("cursor")}
            >
              cursor
            </button>
            <button type="button" className="pg-btn" onClick={clear}>
              Clear
            </button>
          </div>
          <div className="pg-col" style={{ marginTop: 8 }}>
            {HIGHLIGHTABLE_ELEMENT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`pg-btn pg-btn--target${state.elementId === id ? " is-on" : ""}`}
                onClick={() => highlight(id, style)}
              >
                {id}
                <span style={{ opacity: 0.7 }}> · {ELEMENT_REGISTRY[id].labelEn}</span>
              </button>
            ))}
          </div>
          <p className="pg-hint">
            active: {state.elementId ?? "none"} / {state.style}
          </p>
        </div>

        <div className="pg-panel">
          <h3>Harness</h3>
          <div className="pg-row">
            <button
              type="button"
              className={`pg-btn${rtl ? " is-on" : ""}`}
              onClick={() => setRtl((v) => !v)}
            >
              dir = {rtl ? "rtl" : "ltr"}
            </button>
            <button type="button" className="pg-btn" onClick={checkRegistry}>
              assertRegistryMounted()
            </button>
            <button
              type="button"
              className="pg-btn"
              onClick={() => setStepIndex((i) => (i + 1) % (FAKE_STEPS.length + 1))}
            >
              next fake step
            </button>
            <button
              type="button"
              className="pg-btn"
              onClick={() =>
                setStatus(
                  STATUSES[(STATUSES.indexOf(status) + 1) % STATUSES.length],
                )
              }
            >
              cycle status
            </button>
          </div>
        </div>

        <div className="pg-panel">
          <h3>onTutorAction log</h3>
          <pre className="pg-log">{log.join("\n") || "(no actions yet)"}</pre>
        </div>
      </aside>

      <main className="pg-stage">
        <InvoiceApp onTutorAction={onTutorAction} />
      </main>

      {/* Inside the dir wrapper on purpose: the overlay works off measured rects,
          so it must behave identically under RTL. */}
      <HighlightOverlay />
    </div>
  );
}
