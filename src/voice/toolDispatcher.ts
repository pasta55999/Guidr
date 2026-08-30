import type { ToolHandlerMap, ToolName } from "../contracts/tools";
import { TOOL_NAMES } from "../contracts/tools";

/** Shape of the Realtime `response.function_call_arguments.done` server event. */
export interface RealtimeFunctionCall {
  name: string;
  call_id: string;
  arguments: string;
}

export type SendEvent = (event: Record<string, unknown>) => void;

/** Tools that must never take longer than this before we answer the model anyway. */
const WATCHDOG_MS = 2500;

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

async function withWatchdog<T>(
  work: Promise<T>,
  fallback: T,
  ms = WATCHDOG_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Runs a tool call and reports the result back to the model.
 *
 * The single most important property here: a `function_call_output` is ALWAYS
 * sent — on success, on throw, on unknown tool name, on bad JSON, and on
 * timeout. If we ever fail to send one, the model waits forever and the demo
 * dies mid-sentence. Nothing in this function is allowed to reject.
 *
 * The output must be sent as its own conversation.item.create and followed by a
 * separate response.create; inlining it into response.create makes the API
 * reject the call_id.
 */
export async function dispatchToolCall(
  call: RealtimeFunctionCall,
  handlers: ToolHandlerMap,
  send: SendEvent,
  onLog?: (message: string, detail?: unknown) => void,
): Promise<void> {
  let output: unknown;

  try {
    if (!isToolName(call.name)) {
      output = { ok: false, error: `Unknown tool: ${call.name}` };
    } else {
      let args: unknown = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        args = {};
      }

      const handler = handlers[call.name] as (a: unknown) => Promise<unknown>;
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

  onLog?.(`tool ${call.name}`, output);

  try {
    send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output),
      },
    });
    send({ type: "response.create" });
  } catch (error) {
    onLog?.("failed to send tool output", error);
  }
}
