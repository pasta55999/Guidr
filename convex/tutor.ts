import { v } from "convex/values";
import { action } from "./_generated/server";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "./prompts";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 400;

/**
 * The tutor's reasoning turn.
 *
 * The Anthropic key stays in this Convex deployment and never reaches the
 * browser, so unlike the Realtime approach there is no ephemeral-token dance.
 *
 * The browser owns the running message list and executes tool calls, because
 * highlight_element must touch the DOM. So this action is stateless: give it the
 * conversation, get back Claude's next content blocks.
 */
export const respond = action({
  args: {
    // Anthropic message objects: { role, content }. Kept opaque so the
    // conversation shape is not duplicated in a Convex validator.
    messages: v.array(v.any()),
    model: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    { messages, model },
  ): Promise<{
    content: Array<Record<string, unknown>>;
    stopReason: string | null;
  }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set on this Convex deployment. Run: npx convex env set ANTHROPIC_API_KEY sk-ant-...",
      );
    }

    const response = await fetch(MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: TUTOR_INSTRUCTIONS,
        tools: TUTOR_TOOLS,
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Claude request failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      content?: Array<Record<string, unknown>>;
      stop_reason?: string | null;
    };

    return {
      content: data.content ?? [],
      stopReason: data.stop_reason ?? null,
    };
  },
});
