/**
 * Bridge: re-exports the softcode engine from @ursamu/mush.
 */
// softcodeService exported below as softcodeServiceCompat (has runSoftcode shim)
export { softcodeEngine, runSoftcode } from "@ursamu/mush";
export type { DbAccessor, OutputAccessor } from "@ursamu/mush";

/** Softcode execution options (actorId-based convenience shape). */
export interface SoftcodeContext {
  actorId:     string;
  executorId?: string;
  args?:       string[];
  socketId?:   string;
}

// Compat shim — some old code uses SoftcodeService.getInstance()
// and softcodeService.runSoftcode(...) with the simple opts shape.
import { sandboxService, runSoftcodeSimple } from "@ursamu/mush";

/** Compat wrapper: adds runSoftcode(code, simpleOpts) to sandboxService. */
export const softcodeServiceCompat = Object.assign(sandboxService, {
  runSoftcode: (code: string, opts: SoftcodeContext): Promise<string> =>
    runSoftcodeSimple(code, {
      actorId:    opts.actorId,
      executorId: opts.executorId ?? opts.actorId,
      args:       opts.args ?? [],
      socketId:   opts.socketId,
    }),
});

export const SoftcodeService = { getInstance: () => softcodeServiceCompat };
export { softcodeServiceCompat as softcodeService };
