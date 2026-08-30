import { HighlightProvider } from "./overlay/HighlightProvider";
import { LessonRuntime } from "./lesson/LessonRuntime";

// Provider composition. Deliberately thin:
//   HighlightProvider  ephemeral pointing state (UI only)
//   LessonRuntime      wires Convex progress <-> simulated app <-> voice session
// Durable state lives in Convex; the Realtime model owns only conversation.
export default function App() {
  return (
    <HighlightProvider>
      <LessonRuntime />
    </HighlightProvider>
  );
}
