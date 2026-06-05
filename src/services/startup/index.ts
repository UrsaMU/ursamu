/**
 * Bridge — implementation lives in @ursamu/mush.
 * This wrapper supplies the engine-local `force` and `runSoftcode` dependencies.
 */
import { runStartupAttrs as _runStartupAttrs, runSoftcodeSimple } from "@ursamu/mush";
import { force } from "../commands/index.ts";

export async function runStartupAttrs(): Promise<void> {
  await _runStartupAttrs(force, (code, opts) => runSoftcodeSimple(code, { ...opts, executorId: opts.actorId }));
}
