import { createContext, useContext, type ReactNode } from "react";
import { useVoiceLoop, type UseVoiceLoopOptions } from "./useVoiceLoop";

type VoiceContextValue = ReturnType<typeof useVoiceLoop>;

const VoiceContext = createContext<VoiceContextValue | null>(null);

export interface VoiceProviderProps extends UseVoiceLoopOptions {
  children: ReactNode;
}

export function VoiceProvider({ children, ...options }: VoiceProviderProps) {
  const voice = useVoiceLoop(options);
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside <VoiceProvider>");
  return ctx;
}
