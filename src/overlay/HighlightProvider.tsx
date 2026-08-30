// Ephemeral highlight state. This is UI-only: it is never persisted, and it
// never carries lesson progress (that lives in Convex). The only input is a
// semantic element id from the registry — never a coordinate.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TutorElementId } from "../contracts/elements";
import type { HighlightState } from "../contracts/session";

export type HighlightStyle = HighlightState["style"];

export interface HighlightApi {
  state: HighlightState;
  /** Point at an element. `style` defaults to "cursor". */
  highlight: (elementId: TutorElementId, style?: HighlightStyle) => void;
  clear: () => void;
}

const DEFAULT_STYLE: HighlightStyle = "cursor";

const HighlightContext = createContext<HighlightApi | null>(null);

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HighlightState>({
    elementId: null,
    style: DEFAULT_STYLE,
  });

  const highlight = useCallback(
    (elementId: TutorElementId, style: HighlightStyle = DEFAULT_STYLE) => {
      setState({ elementId, style });
    },
    [],
  );

  const clear = useCallback(() => {
    setState((prev) => ({ elementId: null, style: prev.style }));
  }, []);

  const api = useMemo<HighlightApi>(
    () => ({ state, highlight, clear }),
    [state, highlight, clear],
  );

  return (
    <HighlightContext.Provider value={api}>
      {children}
    </HighlightContext.Provider>
  );
}

export function useHighlight(): HighlightApi {
  const ctx = useContext(HighlightContext);
  if (!ctx) {
    throw new Error("useHighlight must be used inside <HighlightProvider>");
  }
  return ctx;
}
