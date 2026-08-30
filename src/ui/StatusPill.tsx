// Presentational only: plain props, no Convex, no data fetching.

import type { TutorStatus } from "../contracts/session";
import "./ui.css";

const LABELS: Record<TutorStatus, string> = {
  idle: "Not started",
  starting: "Starting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Tutor speaking",
  error: "Voice error",
};

export function StatusPill({ status }: { status: TutorStatus }) {
  return (
    <span className={`ui-pill ui-pill--${status}`}>
      <span className="ui-pill-dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}

export default StatusPill;
