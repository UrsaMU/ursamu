// tools/ursamu-shim.ts — Showcase shim for @ursamu/mush.
//
// Re-exports the real package so the showcase gets genuine
// implementations. Intercepts:
//   * addCmd — collects descriptors into cmds[] for in-process dispatch
//   * send   — routes output through __shimSetSendSink
// deno-lint-ignore-file no-explicit-any

(globalThis as any).__cmds ??= [];

export const cmds: any[] = (globalThis as any).__cmds;

export function addCmd(cmd: any): void {
  (globalThis as any).__cmds ??= [];
  (globalThis as any).__cmds.push(cmd);
}

export * from "../../mush/mod.ts";

const _objs: any[] = [];

export function __shimSeed(objs: any[]): void {
  _objs.length = 0;
  for (const o of objs) _objs.push(o);
}

export function __shimObjs(): any[] {
  return _objs;
}

let _sendSink: ((sids: string[], msg: string) => void) | null = null;

export function __shimSetSendSink(
  fn: ((sids: string[], msg: string) => void) | null,
): void {
  _sendSink = fn;
}

export function send(sids: string[], msg: string): void {
  if (_sendSink) _sendSink(sids, msg);
}
