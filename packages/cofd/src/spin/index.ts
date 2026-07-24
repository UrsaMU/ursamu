// Hedgespinning barrel (CtL).

export type {
  SpinEffect,
  SpinEffectDef,
  SpinKind,
  SpinResult,
} from "./types.ts";
export {
  SPIN_EFFECTS,
  findSpinEffect,
  isSpinEffect,
  listSpinEffects,
} from "./catalog.ts";
export {
  hedgeContestPool,
  resolveSpin,
  type SpinContext,
} from "./resolve.ts";
