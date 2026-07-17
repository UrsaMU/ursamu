// Hedgespinning barrel (CtL).

export type {
  SpinEffect,
  SpinEffectDef,
  SpinResult,
} from "./types.ts";
export { SPIN_EFFECTS } from "./types.ts";
export {
  findSpinEffect,
  isSpinEffect,
  listSpinEffects,
} from "./catalog.ts";
export {
  resolveSpin,
  type SpinContext,
} from "./resolve.ts";
