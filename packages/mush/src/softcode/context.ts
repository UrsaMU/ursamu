/**
 * Softcode evaluation context types for @ursamu/mush.
 *
 * Merges the old src/services/Softcode/context.ts (DbAccessor, OutputAccessor,
 * EvalContext) and src/services/Softcode/ursamu-context.ts (UrsaEvalContext)
 * into a single module so stdlib files only need one import.
 */
import type { EvalContext as LibEvalContext, IEvalEngine, IterFrame } from "@ursamu/mushcode/eval";
import type { IDBObj } from "../world/types.ts";

export type { IterFrame };
export type { LibEvalContext };

// ── DbAccessor ────────────────────────────────────────────────────────────────

export interface DbAccessor {
  queryById(id: string): Promise<IDBObj | null>;
  queryByName(name: string): Promise<IDBObj | null>;
  lcon(locationId: string): Promise<IDBObj[]>;
  lwho(): Promise<IDBObj[]>;
  lattr(objId: string): Promise<string[]>;
  getAttribute(obj: IDBObj, attrName: string): Promise<string | null>;
  getTagById(tagName: string): Promise<string | null>;
  getPlayerTagById(actorId: string, tagName: string): Promise<string | null>;
  lsearch(opts: {
    type?:    "PLAYER" | "ROOM" | "EXIT" | "THING";
    owner?:   string;
    flags?:   string;
    attr?:    string;
    attrVal?: string;
  }): Promise<string[]>;
  children(parentId: string): Promise<IDBObj[]>;
  lchannels(): Promise<string>;
  channelsFor(playerId: string): Promise<string>;
  mailCount(playerId: string): Promise<number>;
  queueLength(executorId: string): Promise<number>;
  getIdleSecs(playerId: string): Promise<number>;
  getConnSecs?: (playerId: string) => Promise<number>;
  getUserFn(name: string): Promise<string | null>;
  createObj?: (name: string, cost: number, actorId: string) => Promise<string | null>;
}

// ── OutputAccessor ────────────────────────────────────────────────────────────

export interface OutputAccessor {
  send(message: string, targetId?: string): void;
  roomBroadcast(message: string, roomId: string, excludeId?: string): void;
  broadcast(message: string): void;
}

// ── EvalContext ───────────────────────────────────────────────────────────────

export interface EvalContext {
  actor:     IDBObj;
  executor:  IDBObj;
  caller:    IDBObj | null;
  args:      string[];
  registers: Map<string, string>;
  iterStack: Array<{ item: string; pos: number }>;
  depth:     number;
  deadline:  number;
  db:        DbAccessor;
  output:    OutputAccessor;
}

// ── UrsaEvalContext ───────────────────────────────────────────────────────────

export interface UrsaEvalContext {
  enactor:      string;
  executor:     IDBObj;
  caller:       IDBObj | null;
  args:         string[];
  registers:    Map<string, string>;
  iterStack:    IterFrame[];
  depth:        number;
  maxDepth:     number;
  maxOutputLen: number;
  signal?:      AbortSignal;
  commandContext?: {
    lastCommand?: string;
    lastArgs?:    string;
    pipedOutput?: string;
  };
  actor:   IDBObj;
  db:      DbAccessor;
  output:  OutputAccessor;
  deadline: number;
  _engine: IEvalEngine;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toLibCtx(ctx: UrsaEvalContext): LibEvalContext {
  return ctx as unknown as LibEvalContext;
}

export function makeSubCtx(
  ctx: UrsaEvalContext,
  newExecutor: IDBObj,
  args: string[],
  local: boolean,
): UrsaEvalContext {
  return {
    ...ctx,
    enactor:   ctx.enactor,
    executor:  newExecutor,
    caller:    ctx.executor,
    args,
    registers: local ? new Map(ctx.registers) : ctx.registers,
    iterStack: ctx.iterStack,
    depth:     ctx.depth + 1,
  };
}

export function snapshotRegisters(ctx: UrsaEvalContext): Map<string, string> {
  return new Map(ctx.registers);
}

export function restoreRegisters(ctx: UrsaEvalContext, snap: Map<string, string>): void {
  ctx.registers.clear();
  for (const [k, v] of snap) ctx.registers.set(k, v);
}

export function isTooDeep(ctx: UrsaEvalContext): boolean {
  return ctx.depth >= ctx.maxDepth;
}

export function isTimedOut(ctx: UrsaEvalContext): boolean {
  return Date.now() >= ctx.deadline;
}
