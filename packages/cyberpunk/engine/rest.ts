/**
 * Cyberpunk RED -- Wound Recovery Timer Utilities
 * Pure functions for time-gated rest and healing.
 * CPR Core p.224 -- Natural and medical recovery.
 */
import type { ICPRCharacter, WoundState } from "../db/schemas.ts";
import { d6 } from "./dice.ts";
import { applyHealingToChar } from "./character.ts";

export type RestType = "short" | "long";

export interface IRestTimer {
  startedAt: number;
  type: RestType;
}

/** Short rest: 8 hours -> 2d6 HP healed. */
export const SHORT_REST_MS = 8 * 60 * 60 * 1_000;

/** Long rest: 24 hours -> full HP recovery. */
export const LONG_REST_MS = 24 * 60 * 60 * 1_000;

/** Milliseconds remaining for an active rest. Negative when overdue. */
export const msRemaining = (timer: IRestTimer, now = Date.now()): number => {
  const durationMs = timer.type === "short" ? SHORT_REST_MS : LONG_REST_MS;
  return timer.startedAt + durationMs - now;
};

/** True when the rest period has fully elapsed. */
export const isRestComplete = (timer: IRestTimer, now = Date.now()): boolean =>
  msRemaining(timer, now) <= 0;

/**
 * Compute healing from a completed rest period.
 * Short: 2d6 HP. Long: full HP.
 */
export const calcRestHeal = (
  type: RestType,
  cpr: ICPRCharacter,
): { amount: number; newHp: number; newWoundState: WoundState } => {
  const amount = type === "long" ? cpr.hp.max - cpr.hp.current : d6() + d6();
  const { newHp, newWoundState } = applyHealingToChar(cpr, amount);
  return { amount, newHp, newWoundState };
};

/** Human-readable duration string, e.g. "7h 23m" or "45m". */
export const msToDisplay = (ms: number): string => {
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
