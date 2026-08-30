import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { buildSessionConfig } from "./prompts";

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_VOICE = "marin";

/**
 * Exchanges the permanent OPENAI_API_KEY (server-side only) for a short-lived
 * ephemeral client secret ("ek_...") that the browser uses to open a WebRTC peer
 * connection directly to OpenAI.
 *
 * The tutor instructions and tool schemas are attached here rather than in the
 * browser, so neither is readable in frontend JS.
 */
export const mintClientSecret = internalAction({
  args: { ttlSeconds: v.optional(v.number()) },
  handler: async (_ctx, { ttlSeconds }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set on this Convex deployment. Run: npx convex env set OPENAI_API_KEY sk-...",
      );
    }

    const model = process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_MODEL;
    const voice = process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_VOICE;

    const response = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: buildSessionConfig(model, voice),
        expires_after: {
          anchor: "created_at",
          seconds: ttlSeconds ?? 600,
        },
      }),
    });

    if (!response.ok) {
      // Surface OpenAI's message but never the key.
      const detail = await response.text();
      throw new Error(
        `OpenAI client_secrets failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      value?: string;
      expires_at?: number;
    };

    if (!data.value) {
      throw new Error("OpenAI client_secrets returned no token value");
    }

    // Only the ephemeral token and its expiry ever leave the server.
    return { value: data.value, expiresAt: data.expires_at ?? null, model };
  },
});
