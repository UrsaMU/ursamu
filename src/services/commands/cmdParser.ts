/**
 * Bridge: re-exports addCmd, cmds, and related utilities from @ursamu/mush.
 * Commands registered via this path now go into the mush dispatch pipeline.
 */
export { addCmd, cmds, loadDefaultCommands, registerScript } from "@ursamu/mush";
export type { ICmd } from "@ursamu/mush";
export { addMiddleware as registerCmdMiddleware } from "@ursamu/core";
export { runPipeline } from "@ursamu/core";

// Shim: old code uses cmdParser.run(ctx) — bridge it to runPipeline
import { runPipeline as _run } from "@ursamu/core";
import { send } from "@ursamu/core";
export const cmdParser = {
  run: async (ctx: { socket?: { id?: string; cid?: string }; msg?: string }) => {
    const socketId  = ctx.socket?.id  ?? "";
    const sessionId = ctx.socket?.cid ?? null;
    const input     = ctx.msg ?? "";
    if (!input.trim()) return;
    await _run({
      socketId, sessionId, input, args: [],
      send: (msg: string) => send([socketId], msg),
    });
  },
  use: (_fn: unknown) => {},
};

export const clearCmds     = (): void => {};
export const txtFiles       = new Map<string, string>();
export const systemAliases: Record<string, string> = {};
export const loadSystemAliases = async (): Promise<void> => {};
