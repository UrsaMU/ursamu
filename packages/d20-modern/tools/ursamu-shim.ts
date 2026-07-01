// deno-lint-ignore-file no-explicit-any

import { cmds as coreCmds, addCmd as coreAddCmd } from "../../mush/mod.ts";

export const cmds = coreCmds;
export const addCmd = coreAddCmd;

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
  fn: ((sids: string[], msg: string) => void) | null
): void {
  _sendSink = fn;
}

export function send(sids: string[], msg: string): void {
  if (_sendSink) _sendSink(sids, msg);
}
