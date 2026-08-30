import type { ToolHandlerMap, ToolName } from "../contracts/tools";
import { TOOL_NAMES } from "../contracts/tools";

/** OpenAI-style tool call, as returned through OpenRouter. */
export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

/** OpenAI-style tool result message. */
export interface ToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

const WATCHDOG_MS = 2500;

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

async function withWatchdog<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), WATCHDOG_MS);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Executes one tool call and always returns a tool result message.
 *
 * A result is produced on success, on throw, on unknown tool name, on
 * unparseable arguments and on timeout. Every tool_call must be answered before
 * the next request or the API rejects the conversation — so a missing result is
 * a hard error, not merely a stalled tutor. Nothing here is allowed to reject.
 */
export async function runToolCall(
  call: ToolCall,
  handlers: ToolHandlerMap,
  onLog?: (message: string, detail?: unknown) => void,
): Promise<ToolResultMessage> {
  let output: unknown;

  try {
    const name = call.function?.name ?? "";
    if (!isToolName(name)) {
      output = { ok: false, error: `Unknown tool: ${name}` };
    } else {
      let args: unknown = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }

      const handler = handlers[name] as (a: unknown) => Promise<unknown>;
      output = await withWatchdog(
        Promise.resolve(handler(args)).catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : "Tool failed",
        })),
        { ok: false, error: "Tool timed out" },
      );
    }
  } catch (error) {
    output = {
      ok: false,
      error: error instanceof Error ? error.message : "Tool dispatch failed",
    };
  }

  onLog?.(`tool ${call.function?.name}`, output);

  return {
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(output),
  };
}
