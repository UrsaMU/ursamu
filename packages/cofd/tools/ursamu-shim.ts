// tools/ursamu-shim.ts -- Showcase shim for @ursamu/ursamu.
//
// Re-exports the real package so the showcase gets genuine implementations
// of header(), footer(), divider(), and all types. Only two symbols are
// intercepted:
//
//   * addCmd   -- collects command descriptors into `cmds[]` so the runner
//                can dispatch them in-process without a live server.
//   * send     -- routes output through `__shimSetSendSink` instead of
//                attempting real WebSocket delivery.
//
// Everything else (header, footer, divider, DBO, gameHooks, ...) comes
// straight from @ursamu/mush.
// deno-lint-ignore-file no-explicit-any

globalThis.__cmds ??= [];

export const cmds: any[] = globalThis.__cmds;

export function addCmd(cmd: any): void {
  globalThis.__cmds ??= [];
  globalThis.__cmds.push(cmd);
}

export * from "../../ursamu/packages/mush/mod.ts";
export { header, divider, footer } from "../src/support/format.ts";

import { setTheme } from "@ursamu/globals";
import { cofdGlobalsOverlay } from "../src/support/theme.ts";
import { registerFormatHandler } from "../../ursamu/packages/mush/mod.ts";
import { cofdConformatHandler, cofdDescformatHandler } from "../src/support/look_format.ts";

// Apply the CoFD Red/Gold theme overlay.
setTheme(cofdGlobalsOverlay).catch(() => {});

// Register the custom look CONFORMAT and DESCFORMAT handlers for the showcase runner.
registerFormatHandler("CONFORMAT", cofdConformatHandler, { prepend: true });
registerFormatHandler("DESCFORMAT", cofdDescformatHandler, { prepend: true });

// Load look command from local ursamu core so it's registered for look-conformat showcase.
import "../../ursamu/packages/mush/src/verbs/look.ts";
import { cmds as coreCmds } from "../../ursamu/packages/mush/src/commands/addCmd.ts";

for (const c of coreCmds) {
  if (!cmds.includes(c)) cmds.push(c);
}

// -- In-memory object store ----------------------------------------------------
// Populated by the runner via __shimSeed() so that any dbojs queries
// the command handlers make find the mock players / objects.

const _objs: any[] = [];

export function __shimSeed(objs: any[]): void {
  _objs.length = 0;
  for (const o of objs) _objs.push(o);
}

export function __shimObjs(): any[] {
  return _objs;
}

// -- send() output capture -----------------------------------------------------
// Override the module-level send() so output goes to the showcase sink
// rather than real sockets.

let _sendSink: ((sids: string[], msg: string) => void) | null = null;

export function __shimSetSendSink(
  fn: ((sids: string[], msg: string) => void) | null,
): void {
  _sendSink = fn;
}

export function send(sids: string[], msg: string): void {
  if (_sendSink) _sendSink(sids, msg);
}
