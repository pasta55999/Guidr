// OWNED BY THE INTEGRATION WORKSTREAM (Phase 3).
// Composes: HighlightProvider -> RealtimeProvider -> LessonRuntime -> app + overlay.
// Until then, the UI/overlay work lives at /?playground.

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Clicky-UAE</h1>
      <p>
        Integration lands in Phase 3. The simulated app and overlay are at{" "}
        <a href="/?playground">/?playground</a>.
      </p>
    </div>
  );
}
