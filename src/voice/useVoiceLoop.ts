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
import { detectLanguage, speak, stopSpeaking } from "./speak";
import { languageDirective, type LearnerLanguage } from "./notifyAgent";
import { runToolCall, type ToolCall } from "./toolDispatcher";

/** OpenAI-style chat message (OpenRouter fronts Claude with this shape). */
interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
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
const LISTEN_TIMEOUT_MS = 20_000;

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
  const [learnerLanguage, setLearnerLanguage] = useState<LearnerLanguage>("en");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [interruptHeld, setInterruptHeld] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  const handlersRef = useRef(handlers);
  const openingRef = useRef(buildOpeningMessage);
  const micRef = useRef<MicController | null>(null);
  const sttRef = useRef<BrowserSttController | null>(null);
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  const sttFailuresRef = useRef(0);
  const languageRef = useRef<LearnerLanguage>("en");
  const interruptHeldRef = useRef(false);
  const turnVersionRef = useRef(0);
  const speechSignalRef = useRef<{ cancelled: boolean } | null>(null);
  const protocolBarrierRef = useRef<Promise<void> | null>(null);
  const nextUtteranceIsInterruptionRef = useRef(false);
  const listenTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
    openingRef.current = buildOpeningMessage;
  }, [handlers, buildOpeningMessage]);

  const pushLine = useCallback((role: "learner" | "tutor", text: string) => {
    setTranscript((prev) => [...prev.slice(-30), { role, text, at: Date.now() }]);
  }, []);

  const clearListenTimeout = useCallback(() => {
    if (listenTimeoutRef.current === null) return;
    window.clearTimeout(listenTimeoutRef.current);
    listenTimeoutRef.current = null;
  }, []);

  const synthesize = useCallback(
    (text: string) => synthesizeAction({ text }),
    [synthesizeAction],
  );

  /**
   * One reasoning turn, including the tool loop.
   *
   * Every tool_call must be answered by a matching tool message before the next
   * request, or the API rejects the conversation — so tool rounds are
   * sequential and we never drop one.
   */
  const runTutorTurn = useCallback(async () => {
    if (!activeRef.current) return;
    clearListenTimeout();

    const version = ++turnVersionRef.current;
    const signal = { cancelled: false };
    speechSignalRef.current = signal;
    busyRef.current = true;
    micRef.current?.setPaused(true);
    sttRef.current?.setPaused(true);

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        setStatus("thinking");
        const result = await respond({ messages: messagesRef.current });
        if (!activeRef.current || version !== turnVersionRef.current) return;

        const spoken = (result.content ?? "").trim();
        const toolCalls = result.toolCalls ?? [];

        messagesRef.current = [
          ...messagesRef.current,
          {
            role: "assistant",
            content: result.content ?? "",
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
        ];

        if (toolCalls.length > 0) {
          let releaseBarrier: () => void = () => {};
          const barrier = new Promise<void>((resolve) => {
            releaseBarrier = () => resolve();
          });
          protocolBarrierRef.current = barrier;

          try {
            const map = handlersRef.current;
            for (const call of toolCalls) {
              const message = map
                ? await runToolCall(call, map, console.debug)
                : {
                    role: "tool" as const,
                    tool_call_id: call.id,
                    content: JSON.stringify({ ok: false, error: "UI not ready" }),
                  };
              messagesRef.current = [...messagesRef.current, message];
            }
          } finally {
            releaseBarrier();
            if (protocolBarrierRef.current === barrier) {
              protocolBarrierRef.current = null;
            }
          }

          if (!activeRef.current || version !== turnVersionRef.current) return;
        }

        // Tool results are written first so an interruption can never leave an
        // unanswered tool_call in conversation history. The actual DOM effect
        // (highlighting) still lands immediately as the tutor begins speaking.
        if (spoken) {
          pushLine("tutor", spoken);
          setStatus("speaking");
          await speak(spoken, {
            synthesize,
            signal,
            onLog: console.debug,
            onAudioBlocked: () => setAudioBlocked(true),
          });
          if (!activeRef.current || version !== turnVersionRef.current) return;
        }

        if (toolCalls.length === 0) break;
      }
    } catch (err) {
      if (version === turnVersionRef.current) {
        setError(err instanceof Error ? err.message : "Tutor request failed");
        setStatus("error");
      }
      return;
    } finally {
      if (version === turnVersionRef.current) {
        busyRef.current = false;
        if (speechSignalRef.current === signal) speechSignalRef.current = null;
      }
    }

    if (
      activeRef.current &&
      version === turnVersionRef.current &&
      !interruptHeldRef.current
    ) {
      setStatus("idle");
      setLevel(0);
      micRef.current?.setPaused(true);
      sttRef.current?.setPaused(true);
    }
  }, [respond, synthesize, pushLine, clearListenTimeout]);

  /**
   * Append a learner utterance (visible) or a [LESSON_STATE] update (hidden),
   * then let the tutor reply.
   *
   * A learner utterance sets the language, because it is real evidence of what
   * they are speaking. Automated notes are always English, so they must not — but
   * they DO carry an explicit directive naming the current language, otherwise
   * their English wording drags the tutor's replies back into English.
   */
  const sendUserText = useCallback(
    async (
      text: string,
      {
        visible = true,
        interrupted = false,
      }: { visible?: boolean; interrupted?: boolean } = {},
    ) => {
      const clean = text.trim();
      if (!clean || !activeRef.current) return;

      // If interruption happened while a DOM tool was running, wait until its
      // tool result has been appended. OpenRouter rejects a learner message
      // inserted between an assistant tool_call and its matching tool response.
      const barrier = protocolBarrierRef.current;
      if (barrier) await barrier;
      if (!activeRef.current) return;

      let payload = clean;
      if (visible) {
        const detected = detectLanguage(clean);
        languageRef.current = detected;
        setLearnerLanguage(detected);
        pushLine("learner", clean);
        if (interrupted) {
          payload =
            `[LEARNER_INTERRUPTION] The learner intentionally stopped your previous ` +
            `response and said: "${clean}". Address this latest message first; do not ` +
            `finish the interrupted response unless it is still relevant.` +
            languageDirective(detected);
        }
      } else {
        payload = `${clean}${languageDirective(languageRef.current)}`;
      }

      messagesRef.current = [
        ...messagesRef.current,
        { role: "user", content: payload },
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
        const interrupted = nextUtteranceIsInterruptionRef.current;
        nextUtteranceIsInterruptionRef.current = false;
        clearListenTimeout();
        void sendUserText(text, { interrupted });
      },
      onError: (message) => console.debug("[voice] browser stt", message),
    });
    if (!stt) return;
    sttRef.current = stt;
    stt.setPaused(true);
    setUsingFallbackStt(true);
  }, [sendUserText, clearListenTimeout]);

  const handleUtterance = useCallback(
    async (wav: Blob) => {
      if (busyRef.current || !activeRef.current) return;

      const interrupted = nextUtteranceIsInterruptionRef.current;
      nextUtteranceIsInterruptionRef.current = false;
      clearListenTimeout();
      busyRef.current = true;
      setStatus("thinking");
      micRef.current?.setPaused(true);
      sttRef.current?.setPaused(true);

      try {
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
        if (result.text) {
          // Let runTutorTurn own busyRef from here.
          busyRef.current = false;
          await sendUserText(result.text, { interrupted });
        }
      } catch (err) {
        sttFailuresRef.current += 1;
        console.debug("[voice] munsit stt failed", err);
        if (sttFailuresRef.current >= STT_FAILURE_LIMIT) startBrowserFallback();
      } finally {
        // An empty/failed transcription ends this push-to-talk turn without a reply.
        if (activeRef.current && busyRef.current) {
          busyRef.current = false;
          setStatus("idle");
          setLevel(0);
          micRef.current?.setPaused(true);
          sttRef.current?.setPaused(true);
        }
      }
    },
    [transcribe, sendUserText, startBrowserFallback, clearListenTimeout],
  );

  const beginInterrupt = useCallback(() => {
    if (!activeRef.current || interruptHeldRef.current) return;

    clearListenTimeout();
    interruptHeldRef.current = true;
    setInterruptHeld(true);

    // Invalidate any Claude response or tool loop still in flight. Network
    // requests cannot be aborted through Convex's client, but their eventual
    // result is ignored because its version is now stale.
    turnVersionRef.current += 1;
    if (speechSignalRef.current) speechSignalRef.current.cancelled = true;
    stopSpeaking();
    busyRef.current = false;

    setAudioBlocked(false);
    setStatus("listening");
    micRef.current?.setPaused(false);
    micRef.current?.beginHeldTurn();
    sttRef.current?.setPaused(false);
  }, [clearListenTimeout]);

  const endInterrupt = useCallback(() => {
    if (!interruptHeldRef.current) return;

    interruptHeldRef.current = false;
    setInterruptHeld(false);
    nextUtteranceIsInterruptionRef.current = true;

    const submitted = micRef.current?.endHeldTurn() ?? false;
    micRef.current?.setPaused(true);

    // The browser fallback has no force-finalize API, so let its own endpointing
    // deliver the final result. The primary Munsit path submits immediately.
    if (!submitted && !sttRef.current && activeRef.current) {
      nextUtteranceIsInterruptionRef.current = false;
      setStatus("idle");
      setLevel(0);
      micRef.current?.setPaused(true);
    }
  }, []);

  useEffect(() => {
    const isShortcut = (event: KeyboardEvent) =>
      event.code === "Space" && event.ctrlKey;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isShortcut(event) || event.repeat) return;
      event.preventDefault();
      beginInterrupt();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (
        !interruptHeldRef.current ||
        (event.code !== "Space" &&
          event.code !== "ControlLeft" &&
          event.code !== "ControlRight")
      ) {
        return;
      }
      event.preventDefault();
      endInterrupt();
    };

    const onBlur = () => endInterrupt();
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, [beginInterrupt, endInterrupt]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    setError(null);

    if (!activeRef.current) {
      activeRef.current = true;
      setStatus("starting");
      messagesRef.current = [];
      sttFailuresRef.current = 0;

      const mic = createMic({
        onUtterance: (wav) => void handleUtterance(wav),
        onLevel: setLevel,
        onError: (err) => {
          clearListenTimeout();
          activeRef.current = false;
          micRef.current?.stop();
          micRef.current = null;
          setError(err.message);
          setStatus("error");
        },
      });
      mic.setPaused(true);
      micRef.current = mic;
      await mic.start();
      if (!activeRef.current) return;

      const opening = openingRef.current();
      if (opening) {
        messagesRef.current = [
          {
            role: "user",
            content: opening,
          },
        ];
      }
    }

    clearListenTimeout();
    listenTimeoutRef.current = window.setTimeout(() => {
      listenTimeoutRef.current = null;
      if (!activeRef.current || busyRef.current || interruptHeldRef.current) return;
      setStatus("idle");
      setLevel(0);
      micRef.current?.setPaused(true);
      sttRef.current?.setPaused(true);
    }, LISTEN_TIMEOUT_MS);

    setAudioBlocked(false);
    setStatus("listening");
    micRef.current?.setPaused(false);
    sttRef.current?.setPaused(false);
  }, [handleUtterance, clearListenTimeout]);

  const stop = useCallback(() => {
    clearListenTimeout();
    activeRef.current = false;
    busyRef.current = false;
    interruptHeldRef.current = false;
    turnVersionRef.current += 1;
    if (speechSignalRef.current) speechSignalRef.current.cancelled = true;
    speechSignalRef.current = null;
    nextUtteranceIsInterruptionRef.current = false;
    setInterruptHeld(false);
    stopSpeaking();
    micRef.current?.stop();
    micRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    setLevel(0);
    setStatus("idle");
  }, [clearListenTimeout]);

  useEffect(() => stop, [stop]);

  /** Called from a click to satisfy the browser's autoplay gesture requirement. */
  const unlockAudio = useCallback(() => {
    setAudioBlocked(false);
    if ("speechSynthesis" in window) {
      // Speaking an empty utterance is enough to mark the page as user-activated.
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
  }, []);

  return {
    status,
    error,
    level,
    transcript,
    usingFallbackStt,
    learnerLanguage,
    audioBlocked,
    interruptHeld,
    unlockAudio,
    beginInterrupt,
    endInterrupt,
    start,
    stop,
    sendUserText,
  };
}
