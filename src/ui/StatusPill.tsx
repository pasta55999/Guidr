// Presentational only: plain props, no Convex, no data fetching.

import type { TutorStatus } from "../contracts/session";
import "./ui.css";

const LABELS: Record<TutorStatus, string> = {
  idle: "Not connected",
  "requesting-token": "Authorising…",
  connecting: "Connecting…",
  live: "Tutor live",
  reconnecting: "Reconnecting…",
  error: "Connection error",
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
