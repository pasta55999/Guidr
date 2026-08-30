import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorStatus } from "../contracts/session";
import type { ToolHandlerMap } from "../contracts/tools";
import {
  dispatchToolCall,
  type RealtimeFunctionCall,
  type SendEvent,
} from "./toolDispatcher";

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export interface TranscriptLine {
  role: "learner" | "tutor";
  text: string;
  at: number;
}

export interface UseRealtimeSessionOptions {
  /** Convex session id; the token endpoint refuses to mint without a live one. */
  sessionId: string | null;
  /** Latest tool handlers. Read through a ref so reconnects never use stale closures. */
  handlers: ToolHandlerMap | null;
  /** Called once the data channel is open, to push the resume state. */
  onConnected?: (send: SendEvent) => void;
}

export function useRealtimeSession({
  sessionId,
  handlers,
  onConnected,
}: UseRealtimeSessionOptions) {
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handlersRef = useRef(handlers);
  const onConnectedRef = useRef(onConnected);
  const retriedRef = useRef(false);
  const connectingRef = useRef(false);
  // Lets the reconnect path call connect() without connect referencing itself.
  const connectRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
    onConnectedRef.current = onConnected;
  }, [handlers, onConnected]);

  const send = useCallback<SendEvent>((event) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  const teardown = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    teardown();
    connectingRef.current = false;
    setStatus("idle");
  }, [teardown]);

  const handleServerEvent = useCallback(
    (raw: string) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }

      const type = event.type as string | undefined;
      if (!type) return;

      if (type === "response.function_call_arguments.done") {
        const call = event as unknown as RealtimeFunctionCall;
        const map = handlersRef.current;
        if (!map) return;
        void dispatchToolCall(call, map, send, (msg, detail) =>
          console.debug("[voice]", msg, detail),
        );
        return;
      }

      if (type === "conversation.item.input_audio_transcription.completed") {
        const text = (event.transcript as string | undefined)?.trim();
        if (text) {
          setTranscript((prev) => [
            ...prev.slice(-20),
            { role: "learner", text, at: Date.now() },
          ]);
        }
        return;
      }

      if (type === "response.output_audio_transcript.done") {
        const text = (event.transcript as string | undefined)?.trim();
        if (text) {
          setTranscript((prev) => [
            ...prev.slice(-20),
            { role: "tutor", text, at: Date.now() },
          ]);
        }
        return;
      }

      if (type === "error") {
        console.error("[voice] realtime error", event);
      }
    },
    [send],
  );

  const connect = useCallback(async () => {
    if (!sessionId || connectingRef.current) return;
    connectingRef.current = true;
    setError(null);

    try {
      setStatus("requesting-token");
      const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string;
      const tokenResponse = await fetch(`${siteUrl}/realtime/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!tokenResponse.ok) {
        const detail = await tokenResponse.text();
        throw new Error(`Token request failed (${tokenResponse.status}): ${detail}`);
      }

      const { value: ephemeralKey } = (await tokenResponse.json()) as {
        value: string;
      };
      if (!ephemeralKey) throw new Error("Token endpoint returned no value");

      setStatus("connecting");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => handleServerEvent(e.data as string);
      dc.onopen = () => {
        retriedRef.current = false;
        setStatus("live");
        onConnectedRef.current?.(send);
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected") {
          // One silent retry. Progress lives in Convex, so nothing is lost.
          if (!retriedRef.current) {
            retriedRef.current = true;
            setStatus("reconnecting");
            teardown();
            connectingRef.current = false;
            void connectRef.current?.();
          } else {
            setStatus("error");
            setError("Connection lost");
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const detail = await sdpResponse.text();
        throw new Error(`SDP exchange failed (${sdpResponse.status}): ${detail}`);
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (err) {
      teardown();
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to start voice session");
    } finally {
      connectingRef.current = false;
    }
  }, [sessionId, handleServerEvent, send, teardown]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Mute by disabling the track rather than dropping it, so the peer
  // connection and the model's session stay alive.
  useEffect(() => {
    streamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = micEnabled));
  }, [micEnabled]);

  useEffect(() => teardown, [teardown]);

  return {
    status,
    error,
    micEnabled,
    setMicEnabled,
    transcript,
    connect,
    disconnect,
    send,
  };
}
