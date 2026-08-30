import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { TutorStatus } from "../contracts/session";
import type { ToolHandlerMap } from "../contracts/tools";
import { createMic, type MicController } from "./mic";
import {
  createBrowserStt,
  isBrowserSttAvailable,
  type BrowserSttController,
} from "./browserStt";
import { speak, stopSpeaking } from "./speak";
import { runToolUse, type ToolUseBlock } from "./toolDispatcher";

/** Anthropic message. Content is either a plain string or content blocks. */
interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface TranscriptLine {
  role: "learner" | "tutor";
  text: string;
  at: number;
}

/** Consecutive Munsit failures before we switch to the browser engine. */
const STT_FAILURE_LIMIT = 2;
/** Safety valve on the tool loop, in case the tutor keeps calling tools. */
const MAX_TOOL_ROUNDS = 6;

export interface UseVoiceLoopOptions {
  handlers: ToolHandlerMap | null;
  /** Opening instruction, e.g. the resume message for the persisted step. */
  buildOpeningMessage: () => string | null;
}

export function useVoiceLoop({
  handlers,
  buildOpeningMessage,
}: UseVoiceLoopOptions) {
  const transcribe = useAction(api.speech.transcribe);
  const synthesizeAction = useAction(api.speech.synthesize);
  const respond = useAction(api.tutor.respond);

  const [status, setStatus] = useState<TutorStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [usingFallbackStt, setUsingFallbackStt] = useState(false);

  const messagesRef = useRef<ClaudeMessage[]>([]);
  const handlersRef = useRef(handlers);
  const openingRef = useRef(buildOpeningMessage);
  const micRef = useRef<MicController | null>(null);
  const sttRef = useRef<BrowserSttController | null>(null);
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  const sttFailuresRef = useRef(0);

  useEffect(() => {
    handlersRef.current = handlers;
    openingRef.current = buildOpeningMessage;
  }, [handlers, buildOpeningMessage]);

  const pushLine = useCallback((role: "learner" | "tutor", text: string) => {
    setTranscript((prev) => [...prev.slice(-30), { role, text, at: Date.now() }]);
  }, []);

  const synthesize = useCallback(
    (text: string) => synthesizeAction({ text }),
    [synthesizeAction],
  );

  /**
   * One reasoning turn, including the tool loop.
   *
   * Anthropic requires every tool_use block to be answered by a tool_result in
   * the immediately following user message, so tool rounds must be sequential
   * and complete — we never drop one.
   */
  const runTutorTurn = useCallback(async () => {
    if (!activeRef.current) return;
    busyRef.current = true;
    micRef.current?.setPaused(true);
    sttRef.current?.setPaused(true);

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        setStatus("thinking");
        const result = await respond({ messages: messagesRef.current });
        if (!activeRef.current) return;

        const blocks = result.content ?? [];
        messagesRef.current = [
          ...messagesRef.current,
          { role: "assistant", content: blocks },
        ];

        const spoken = blocks
          .filter((b) => b.type === "text")
          .map((b) => String(b.text ?? ""))
          .join(" ")
          .trim();

        const toolUses = blocks.filter(
          (b) => b.type === "tool_use",
        ) as unknown as ToolUseBlock[];

        // Speak before running tools so the highlight lands while the tutor is
        // still talking about it, which is what makes it feel like pointing.
        if (spoken) {
          pushLine("tutor", spoken);
          setStatus("speaking");
          await speak(spoken, { synthesize, onLog: console.debug });
        }

        if (toolUses.length === 0) break;

        const map = handlersRef.current;
        const results = [];
        for (const use of toolUses) {
          results.push(
            map
              ? await runToolUse(use, map, console.debug)
              : {
                  type: "tool_result" as const,
                  tool_use_id: use.id,
                  content: JSON.stringify({ ok: false, error: "UI not ready" }),
                  is_error: true,
                },
          );
        }

        messagesRef.current = [
          ...messagesRef.current,
          {
            role: "user",
            content: results as unknown as Array<Record<string, unknown>>,
          },
        ];
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tutor request failed");
      setStatus("error");
      return;
    } finally {
      busyRef.current = false;
    }

    if (activeRef.current) {
      setStatus("listening");
      micRef.current?.setPaused(false);
      sttRef.current?.setPaused(false);
    }
  }, [respond, synthesize, pushLine]);

  /** Append a learner utterance (or a [LESSON_STATE] update) and let the tutor reply. */
  const sendUserText = useCallback(
    async (text: string, { visible = true }: { visible?: boolean } = {}) => {
      const clean = text.trim();
      if (!clean || !activeRef.current) return;
      if (visible) pushLine("learner", clean);
      messagesRef.current = [
        ...messagesRef.current,
        { role: "user", content: clean },
      ];
      await runTutorTurn();
    },
    [pushLine, runTutorTurn],
  );

  const startBrowserFallback = useCallback(() => {
    if (sttRef.current || !isBrowserSttAvailable()) return;
    micRef.current?.stop();
    micRef.current = null;
    const stt = createBrowserStt({
      onText: (text) => {
        if (busyRef.current) return;
        void sendUserText(text);
      },
      onError: (message) => console.debug("[voice] browser stt", message),
    });
    if (!stt) return;
    sttRef.current = stt;
    stt.start();
    setUsingFallbackStt(true);
  }, [sendUserText]);

  const handleUtterance = useCallback(
    async (wav: Blob) => {
      if (busyRef.current || !activeRef.current) return;

      const bytes = new Uint8Array(await wav.arrayBuffer());
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }

      const result = await transcribe({
        audioBase64: btoa(binary),
        mimeType: "audio/wav",
      });

      if (!result.ok) {
        sttFailuresRef.current += 1;
        console.debug("[voice] munsit stt failed", result.error);
        if (sttFailuresRef.current >= STT_FAILURE_LIMIT) startBrowserFallback();
        return;
      }

      sttFailuresRef.current = 0;
      if (result.text) await sendUserText(result.text);
    },
    [transcribe, sendUserText, startBrowserFallback],
  );

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setError(null);
    setStatus("starting");
    messagesRef.current = [];
    sttFailuresRef.current = 0;

    const mic = createMic({
      onUtterance: (wav) => void handleUtterance(wav),
      onLevel: setLevel,
      onError: (err) => {
        setError(err.message);
        setStatus("error");
      },
    });
    micRef.current = mic;
    await mic.start();

    const opening = openingRef.current();
    if (opening) {
      await sendUserText(opening, { visible: false });
    } else {
      setStatus("listening");
    }
  }, [handleUtterance, sendUserText]);

  const stop = useCallback(() => {
    activeRef.current = false;
    busyRef.current = false;
    stopSpeaking();
    micRef.current?.stop();
    micRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    setLevel(0);
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  return {
    status,
    error,
    level,
    transcript,
    usingFallbackStt,
    start,
    stop,
    sendUserText,
  };
}
