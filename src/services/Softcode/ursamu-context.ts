/**
 * UrsaEvalContext — runtime evaluation context for the UrsaMU softcode engine.
 *
 * Structurally compatible with @ursamu/mushcode's EvalContext via type assertion:
 *   engine.evalString(code, ctx as unknown as LibEvalContext)
 *
 * The `executor` field is kept as IDBObj (not string) for backward compatibility
 * with existing stdlib functions. Custom substitution handlers for %# %! %@ %N %n
 * are registered on the engine to correctly expand these from IDBObj fields.
 */
import type { EvalContext as LibEvalContext, IEvalEngine, IterFrame } from "@ursamu/mushcode/eval";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";
import type { DbAccessor, OutputAccessor } from "./context.ts";

export type { IterFrame };
export type { LibEvalContext };

export interface UrsaEvalContext {
  // ── Fields required by @ursamu/mushcode EvalEngine ────────────────────────
  /** UUID of the enacting object — used by new lib for %# and db functions */
  enactor:      string;
  /** The executing object — kept as IDBObj for stdlib compat; %! handled by custom sub */
  executor:     IDBObj;
  /** The calling object — kept as IDBObj | null; %@ handled by custom sub */
  caller:       IDBObj | null;
  args:         string[];
  registers:    Map<string, string>;
  iterStack:    IterFrame[];
  depth:        number;
  maxDepth:     number;
  maxOutputLen: number;
  signal?:      AbortSignal;
  /** Command context for %w/%W/%| substitutions — set when a command triggers softcode. */
  commandContext?: {
    lastCommand?: string;
    lastArgs?:    string;
    pipedOutput?: string;
  };

  // ── UrsaMU-specific additions ─────────────────────────────────────────────
  /** The enactor as a full IDBObj (same object as enactor, for identity/output stdlib) */
  actor:        IDBObj;
  db:           DbAccessor;
  output:       OutputAccessor;
  /** Deadline timestamp in ms — keep for legacy deadline checks in stdlib */
  deadline:     number;
  /** Engine reference — stdlib helpers use this instead of the old evaluate() */
  _engine:      IEvalEngine;
}

/** Cast UrsaEvalContext to the new lib's EvalContext for engine calls. */
export function toLibCtx(ctx: UrsaEvalContext): LibEvalContext {
  return ctx as unknown as LibEvalContext;
}

/** Create a new sub-context for u()/ulocal() calls. */
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
