import { createContext, useContext, type ReactNode } from "react";
import type { ToolHandlerMap } from "../contracts/tools";
import type { SendEvent } from "./toolDispatcher";
import {
  useRealtimeSession,
  type UseRealtimeSessionOptions,
} from "./useRealtimeSession";

type RealtimeContextValue = ReturnType<typeof useRealtimeSession>;

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export interface RealtimeProviderProps extends UseRealtimeSessionOptions {
  children: ReactNode;
}

export function RealtimeProvider({
  children,
  ...options
}: RealtimeProviderProps) {
  const session = useRealtimeSession(options);
  return (
    <RealtimeContext.Provider value={session}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

export type { ToolHandlerMap, SendEvent };
