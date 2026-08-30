import { lazy, Suspense } from "react";

// Phase 2 seam: the UI workstream iterates on src/dev/Playground.tsx (which it
// owns) without touching integration files. Phase 3 flips the default to the
// real App. Both stay reachable so a regression in one never blocks the other.
//   /            -> real app (Phase 3 onward)
//   /?playground -> UI/overlay playground
const Playground = lazy(() => import("./dev/Playground"));
const App = lazy(() => import("./App"));

export default function Root() {
  const wantsPlayground =
    new URLSearchParams(window.location.search).has("playground");

  return (
    <Suspense fallback={null}>
      {wantsPlayground ? <Playground /> : <App />}
    </Suspense>
  );
}
