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

  const messagesRef = useRef<ChatMessage[]>([]);
  const handlersRef = useRef(handlers);
  const openingRef = useRef(buildOpeningMessage);
  const micRef = useRef<MicController | null>(null);
  const sttRef = useRef<BrowserSttController | null>(null);
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  const sttFailuresRef = useRef(0);
  const languageRef = useRef<LearnerLanguage>("en");

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
   * Every tool_call must be answered by a matching tool message before the next
   * request, or the API rejects the conversation — so tool rounds are
   * sequential and we never drop one.
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

        // Speak before running tools so the highlight lands while the tutor is
        // still talking about it, which is what makes it feel like pointing.
        if (spoken) {
          pushLine("tutor", spoken);
          setStatus("speaking");
          await speak(spoken, {
            synthesize,
            onLog: console.debug,
            onAudioBlocked: () => setAudioBlocked(true),
          });
        }

        if (toolCalls.length === 0) break;

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
    async (text: string, { visible = true }: { visible?: boolean } = {}) => {
      const clean = text.trim();
      if (!clean || !activeRef.current) return;

      let payload = clean;
      if (visible) {
        const detected = detectLanguage(clean);
        languageRef.current = detected;
        setLearnerLanguage(detected);
        pushLine("learner", clean);
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
    unlockAudio,
    start,
    stop,
    sendUserText,
  };
}
