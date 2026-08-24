/**
 * Dispatch system-response effect bodies.
 */
import type { INetState, ISprawlChar } from "../db/schemas.ts";
import type { SysResponse } from "./net.ts";
import { fxBody } from "./sys-response-fx-body.ts";
import { fxConsole } from "./sys-response-fx-console.ts";

export type FxCtx = {
  c: ISprawlChar;
  n: INetState;
  sys: SysResponse;
  rng: () => number;
  notes: string[];
  neural: number;
};

/** Mutates ctx. */
export function runResponseFx(ctx: FxCtx): void {
  if (fxConsole(ctx)) return;
  fxBody(ctx);
}
