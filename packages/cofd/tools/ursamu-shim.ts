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

(globalThis as any).__cmds ??= [];

export const cmds: any[] = (globalThis as any).__cmds;

export function addCmd(cmd: any): void {
  (globalThis as any).__cmds ??= [];
  (globalThis as any).__cmds.push(cmd);
}

export * from "../../mush/mod.ts";

import { registerFormatHandler } from "../../mush/mod.ts";
import {
  cofdConformatHandler,
  cofdDescformatHandler,
} from "../src/support/look_format.ts";

// Layout chrome uses engine game.layout / defaults (same as live server).
// Register CoFD look CONFORMAT / DESCFORMAT for the showcase runner.
registerFormatHandler("CONFORMAT", cofdConformatHandler, { prepend: true });
registerFormatHandler("DESCFORMAT", cofdDescformatHandler, {
  prepend: true,
});

// Load look command from local ursamu core so it's registered for look-conformat showcase.
import "../../mush/src/verbs/look.ts";
import { cmds as coreCmds } from "../../mush/src/commands/addCmd.ts";

for (const c of coreCmds) {
  if (!cmds.includes(c)) cmds.push(c);
}

import {
  dbojs, counters, chans, texts, scenes, chanHistory,
  zoneMemberships, userFuncs, serverTags, playerTags
} from "../../mush/mod.ts";
import { encounterDb } from "../src/combat/encounter.ts";
import { zoneDb } from "../src/combat/zone.ts";
import { maneuverDb } from "../src/social/maneuver.ts";
import { extendedDb } from "../src/subsystems/extended.ts";
import { npcDb } from "../src/npc/directory.ts";

export async function __shimClearDbs(): Promise<void> {
  const dbs = [
    dbojs, counters, chans, texts, scenes, chanHistory,
    zoneMemberships, userFuncs, serverTags, playerTags,
    encounterDb, zoneDb, maneuverDb, extendedDb, npcDb
  ];
  for (const db of dbs) {
    try { await db.clear(); } catch { /* ignore */ }
  }
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
