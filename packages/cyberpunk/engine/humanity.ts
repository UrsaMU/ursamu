/**
 * Cyberpunk RED -- Humanity Regain Utilities
 * Non-therapy humanity recovery from positive experiences.
 * CPR Core p.229 -- Regaining Humanity.
 */
import { d6 } from "./dice.ts";

export type HumanityGainType = "connection" | "achievement" | "kindness" | "memory";

export const HUMANITY_GAIN_TYPES: readonly HumanityGainType[] = [
  "connection", "achievement", "kindness", "memory",
];

/** 24-hour cooldown between humanity gain events. */
export const HUMANITY_COOLDOWN_MS = 24 * 60 * 60 * 1_000;

/**
 * Roll HL reduction for the given gain type.
 *
 * connection:  2d6  (range 2-12) -- spending time with loved ones
 * achievement: 1d6+2 (range 3-8) -- achieving a personal goal
 * kindness:    1d6  (range 1-6)  -- an act of genuine kindness
 * memory:      1d3  (range 1-3)  -- a positive human memory
 */
export const rollHumanityGain = (type: HumanityGainType): number => {
  switch (type) {
    case "connection":  return d6() + d6();
    case "achievement": return d6() + 2;
    case "kindness":    return d6();
    case "memory":      return Math.floor(Math.random() * 3) + 1;
  }
};

/** True if the character's humanity gain is currently on cooldown. */
export const isHumanityGainOnCooldown = (
  lastGainedAt: number | null | undefined,
  now = Date.now(),
): boolean =>
  lastGainedAt !== null &&
  lastGainedAt !== undefined &&
  now - lastGainedAt < HUMANITY_COOLDOWN_MS;

/** Milliseconds remaining until the cooldown expires (0 if already expired). */
export const humanityGainCooldownRemaining = (
  lastGainedAt: number,
  now = Date.now(),
): number => Math.max(0, HUMANITY_COOLDOWN_MS - (now - lastGainedAt));
