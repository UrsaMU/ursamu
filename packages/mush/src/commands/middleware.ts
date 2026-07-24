/**
 * Command middleware chain — runs around native addCmd exec.
 * Used by plugins (e.g. CPR utf8 glyph mode) to wrap every command.
 */
import type { IUrsamuSDK } from "./types.ts";

export interface CmdMiddlewareCtx {
  socketId: string;
  actorId: string;
  msg: string;
  /** Compatibility shape for older plugins (cid = actor id). */
  socket: { cid?: string; socketId: string };
  u: IUrsamuSDK;
}

export type CmdMiddleware = (
  ctx: CmdMiddlewareCtx,
  next: () => Promise<void>,
) => void | Promise<void>;

const _middlewares: CmdMiddleware[] = [];

export function registerCmdMiddleware(fn: CmdMiddleware): void {
  _middlewares.push(fn);
}

export function unregisterCmdMiddleware(fn: CmdMiddleware): void {
  const i = _middlewares.indexOf(fn);
  if (i >= 0) _middlewares.splice(i, 1);
}

export function clearCmdMiddleware(): void {
  _middlewares.length = 0;
}

export function listCmdMiddleware(): readonly CmdMiddleware[] {
  return _middlewares;
}

/** Onion-run middleware then exec. */
export async function runWithCmdMiddleware(
  ctx: CmdMiddlewareCtx,
  exec: () => Promise<void>,
): Promise<void> {
  if (_middlewares.length === 0) {
    await exec();
    return;
  }
  let i = 0;
  const next = async (): Promise<void> => {
    if (i < _middlewares.length) {
      const mw = _middlewares[i++];
      await mw(ctx, next);
    } else {
      await exec();
    }
  };
  await next();
}
