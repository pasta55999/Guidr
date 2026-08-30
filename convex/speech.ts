import { v } from "convex/values";
import { action } from "./_generated/server";

// Munsit (CNTXT FZCO) Arabic speech APIs. The key stays in this Convex
// deployment: the browser never holds it, which is why STT/TTS are proxied here
// rather than called from the client. Munsit has no ephemeral-token mechanism,
// and its browser WebSocket auth requires the raw key in the URL, so a
// server-side hop is the only way to keep the key private.

const BASE = "https://api.munsit.com/api/v1";
const TRANSCRIBE_URL = `${BASE}/audio/transcribe`;
const VOICES_URL = `${BASE}/voices`;
const TTS_MODEL = "faseeh-v1-preview";

/** Mixed Arabic-English model: the whole point of using Munsit for this product. */
const DEFAULT_STT_MODEL = "munsit-en-ar";
const DEFAULT_VOICE_ID = "ar-najdi-male-2";

function requireKey(): string {
  const key = process.env.MUNSIT_API_KEY;
  if (!key) {
    throw new Error(
      "MUNSIT_API_KEY is not set on this Convex deployment. Run: npx convex env set MUNSIT_API_KEY <key>",
    );
  }
  return key;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: a single spread of a large buffer blows the argument limit.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Learner speech -> text, via Munsit's code-switching model.
 * Returns ok:false rather than throwing so the browser can fall back to the
 * built-in Web Speech API instead of stalling the lesson.
 */
export const transcribe = action({
  args: {
    audioBase64: v.string(),
    mimeType: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    { audioBase64, mimeType, model },
  ): Promise<{
    ok: boolean;
    text: string;
    durationSeconds?: number;
    creditsConsumed?: number;
    error?: string;
  }> => {
    try {
      const key = requireKey();
      const bytes = base64ToBytes(audioBase64);
      const extension = mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("ogg")
          ? "ogg"
          : "webm";

      const form = new FormData();
      form.append(
        "file",
        new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }),
        `turn.${extension}`,
      );
      form.append("model", model ?? process.env.MUNSIT_STT_MODEL ?? DEFAULT_STT_MODEL);
      form.append("return_timestamps", "false");

      const response = await fetch(TRANSCRIBE_URL, {
        method: "POST",
        headers: { "x-api-key": key },
        body: form,
      });

      if (!response.ok) {
        const detail = await response.text();
        return {
          ok: false,
          text: "",
          error: `Munsit transcribe failed (${response.status}): ${detail.slice(0, 300)}`,
        };
      }

      const json = (await response.json()) as {
        data?: {
          transcription?: string;
          duration?: number;
          stats?: { creditsConsumed?: number };
        };
      };

      return {
        ok: true,
        text: (json.data?.transcription ?? "").trim(),
        durationSeconds: json.data?.duration,
        creditsConsumed: json.data?.stats?.creditsConsumed,
      };
    } catch (error) {
      return {
        ok: false,
        text: "",
        error: error instanceof Error ? error.message : "Transcription failed",
      };
    }
  },
});

/**
 * Arabic text -> speech (Faseeh). Returns base64 WAV for the browser to play.
 *
 * Faseeh is an Arabic-only engine, so the caller is responsible for routing:
 * English text goes to the browser's SpeechSynthesis instead.
 */
export const synthesize = action({
  args: {
    text: v.string(),
    voiceId: v.optional(v.string()),
    dialect: v.optional(v.string()),
    speed: v.optional(v.number()),
  },
  handler: async (
    _ctx,
    { text, voiceId, dialect, speed },
  ): Promise<{
    ok: boolean;
    audioBase64?: string;
    mimeType?: string;
    error?: string;
  }> => {
    try {
      const key = requireKey();
      const response = await fetch(`${BASE}/text-to-speech/${TTS_MODEL}`, {
        method: "POST",
        headers: { "x-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voiceId ?? process.env.MUNSIT_VOICE_ID ?? DEFAULT_VOICE_ID,
          text,
          stability: 0.5,
          speed: speed ?? 1.0,
          streaming: false,
          sample_rate: 48000,
          dialect: dialect ?? process.env.MUNSIT_DIALECT ?? "emirati",
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        return {
          ok: false,
          error: `Munsit synthesize failed (${response.status}): ${detail.slice(0, 300)}`,
        };
      }

      const buffer = await response.arrayBuffer();
      return {
        ok: true,
        audioBase64: bytesToBase64(new Uint8Array(buffer)),
        mimeType: "audio/wav",
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Synthesis failed",
      };
    }
  },
});

/** Discovery helper: run via `npx convex run speech:listVoices` to pick a voice id. */
export const listVoices = action({
  args: {},
  handler: async (): Promise<unknown> => {
    const key = requireKey();
    const response = await fetch(VOICES_URL, {
      headers: { "x-api-key": key },
    });
    if (!response.ok) {
      throw new Error(
        `Munsit voices failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    }
    return await response.json();
  },
});
