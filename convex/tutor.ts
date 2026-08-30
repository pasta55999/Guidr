import { v } from "convex/values";
import { action } from "./_generated/server";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "./prompts";

// Claude is reached through OpenRouter, which exposes an OpenAI-compatible
// chat-completions API. So messages and tool calls use the OpenAI shapes
// (tool_calls / role:"tool"), not Anthropic's (tool_use / tool_result).
const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Short tutor turns: Haiku is fast and keeps the daily budget intact. */
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const MAX_TOKENS = 400;

export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

/**
 * The tutor's reasoning turn.
 *
 * The API key stays in this Convex deployment and never reaches the browser.
 * The browser owns the running message list and executes tool calls, because
 * highlight_element has to touch the DOM — so this action is stateless: give it
 * the conversation, get back the assistant's next message.
 */
export const respond = action({
  args: {
    // OpenAI-style message objects. Kept opaque rather than duplicating the
    // whole conversation shape in a Convex validator.
    messages: v.array(v.any()),
    model: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    { messages, model },
  ): Promise<{
    content: string;
    toolCalls: ToolCall[];
    finishReason: string | null;
  }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set on this Convex deployment. Run: npx convex env set ANTHROPIC_API_KEY <key>",
      );
    }

    const response = await fetch(COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Clicky-UAE Voice Tutor",
      },
      body: JSON.stringify({
        model: model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        tools: TUTOR_TOOLS,
        tool_choice: "auto",
        messages: [
          { role: "system", content: TUTOR_INSTRUCTIONS },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Tutor request failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: ToolCall[] };
        finish_reason?: string | null;
      }>;
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`Tutor request error: ${data.error.message ?? "unknown"}`);
    }

    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? "",
      toolCalls: choice?.message?.tool_calls ?? [],
      finishReason: choice?.finish_reason ?? null,
    };
  },
});
