/**
 * Bridge: re-exports command system from @ursamu/mush + compat shims.
 */
export { addCmd, cmds, loadDefaultCommands, registerScript } from "@ursamu/mush";
export { addMiddleware as registerCmdMiddleware } from "@ursamu/core";
export { force } from "./force.ts";

// Shim: some old code references cmdParser.run() — provide a no-op
export const cmdParser = {
  run: async (_ctx: unknown) => {},
  use: (_fn: unknown) => {},
};

export const clearCmds     = (): void => {};
export const txtFiles       = new Map<string, string>();
export const systemAliases: Record<string, string> = {};
export const loadSystemAliases = async (): Promise<void> => {};
