import type { ToolHandlerMap, ToolName } from "../contracts/tools";
import { TOOL_NAMES } from "../contracts/tools";

/** Anthropic tool_use content block. */
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/** Anthropic tool_result content block. */
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
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
 * Executes one tool call and always returns a tool_result block.
 *
 * A tool_result is produced on success, on throw, on unknown tool name and on
 * timeout. Anthropic requires every tool_use to be answered by a tool_result in
 * the very next user message, so a missing one is an API error, not just a
 * stalled tutor. Nothing here is allowed to reject.
 */
export async function runToolUse(
  block: ToolUseBlock,
  handlers: ToolHandlerMap,
  onLog?: (message: string, detail?: unknown) => void,
): Promise<ToolResultBlock> {
  let output: unknown;
  let isError = false;

  try {
    if (!isToolName(block.name)) {
      output = { ok: false, error: `Unknown tool: ${block.name}` };
      isError = true;
    } else {
      const handler = handlers[block.name] as (a: unknown) => Promise<unknown>;
      const args = (block.input ?? {}) as unknown;
      output = await withWatchdog(
        Promise.resolve(handler(args)).catch((error: unknown) => {
          isError = true;
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Tool failed",
          };
        }),
        { ok: false, error: "Tool timed out" },
      );
    }
  } catch (error) {
    isError = true;
    output = {
      ok: false,
      error: error instanceof Error ? error.message : "Tool dispatch failed",
    };
  }

  onLog?.(`tool ${block.name}`, output);

  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: JSON.stringify(output),
    ...(isError ? { is_error: true } : {}),
  };
}
