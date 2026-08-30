// Presentational only: plain props, no Convex, no data fetching.
// Voice is the ONLY input modality in this product, so this is the primary
// control on the page and is deliberately large and unmissable.

import type { TutorStatus } from "../contracts/session";
import "./ui.css";

export interface MicButtonProps {
  status: TutorStatus;
  micEnabled: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({
  status,
  micEnabled,
  onStart,
  onStop,
}: MicButtonProps) {
  const connecting = status === "requesting-token" || status === "connecting";
  const active = status === "live" || status === "reconnecting";
  const label = active
    ? "End session"
    : connecting
      ? "Connecting…"
      : status === "error"
        ? "Retry session"
        : "Start talking";

  return (
    <div className="ui-mic-wrap">
      <button
        type="button"
        className={`ui-mic${active ? " is-live" : ""}${connecting ? " is-busy" : ""}`}
        disabled={connecting || !micEnabled}
        aria-pressed={active}
        onClick={active ? onStop : onStart}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          {active ? (
            <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
          ) : (
            <path
              d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm7 8a7 7 0 0 1-6 6.93V21h-2v-3.07A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0h2Z"
              fill="currentColor"
            />
          )}
        </svg>
        <span>{label}</span>
      </button>
      <span className="ui-mic-note">
        {micEnabled
          ? "Speak in English or العربية — the tutor follows your language."
          : "Microphone permission is required."}
      </span>
    </div>
  );
}

export default MicButton;
