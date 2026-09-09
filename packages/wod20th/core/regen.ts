// core/regen.ts -- WoD20th damage regeneration helpers.
//
// Pure functions for healing a character's health track. Garou regenerate
// Bashing (and most Lethal) on the order of one box per turn; Kinfolk and
// mortals heal at human rates. Aggravated never auto-regens. Silver / fire
// damage bypasses Garou regen entirely; for v1 this is gated by the
// per-character `noRegenLethal` flag (set by combat code when the most
// recent qualifying damage was applied).
import type { DamageMark, IWoDChar } from "./types.ts";
import { HEALTH_TRACK_SIZE } from "./health.ts";

export type RegenSeverity = "B" | "L";

/** Damage severity for skip logic. Aggravated > Lethal > Bashing. */
const SEVERITY: Record<DamageMark, number> = { "": 0, B: 1, L: 2, A: 3 };

/**
 * Remove up to `count` health marks of severity `type` from the back of the
 * track (worst-filled slot first). Returns a new track array; does not
 * mutate the input. Aggravated marks are never auto-healed, and marks of
 * a higher severity than `type` are skipped so lower severity heals first.
 */
export function regenTrack(
  track: DamageMark[],
  type: RegenSeverity,
  count: number,
): DamageMark[] {
  const out: DamageMark[] = track.slice() as DamageMark[];
  if (count <= 0) return out;
  let remaining = count;
  for (let i = out.length - 1; i >= 0 && remaining > 0; i--) {
    const m = out[i];
    if (m === "" || m === "A") continue;
    // Skip slots whose severity is higher than what we're healing.
    if (SEVERITY[m] > SEVERITY[type]) continue;
    if (m === type) {
      out[i] = "";
      remaining--;
    }
    // Lower severity than `type` (e.g. B when healing L) -- skip; heal
    // lower severity with its own pass instead.
  }
  return out;
}

/**
 * Apply `count` levels of regen of `type` to `char`. Returns a new char
 * with an updated healthTrack; does not mutate the input. If the char has
 * no health track, returns the input unchanged.
 */
export function regenChar(
  char: IWoDChar,
  type: RegenSeverity,
  count: number,
): IWoDChar {
  const track = char.healthTrack;
  if (!track || track.length === 0) return char;
  const updated = regenTrack(track, type, count);
  // Pad / clamp to canonical size so downstream code stays well-formed.
  while (updated.length < HEALTH_TRACK_SIZE) updated.push("");
  return { ...char, healthTrack: updated };
}

/**
 * Default per-tick regen amount for the splat.
 * WtA: 1 box per turn. Kinfolk / mortal: 0 (use slow heal table / staff
 * commands).
 */
export function defaultRegenPerTick(char: IWoDChar): number {
  return char.splat === "wta" ? 1 : 0;
}
