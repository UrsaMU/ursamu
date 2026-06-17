// Pure CoFD 2e health-track math. No SDK dependencies.
//
// Damage fills the track left-to-right. When the track is full, applying a
// heavier damage type upgrades existing lighter damage one box at a time
// (bashing -> lethal -> aggravated). Total damage is always clamped to the
// track max (stamina + size).
//
// Wound penalties trigger when the three rightmost boxes have damage. Worst
// applicable applies; penalties do NOT stack.

import type { CofdSheet, HealthTrack } from "../stats/sheet.ts";

export type DamageType = "bashing" | "lethal" | "aggravated";

/** Returns max boxes on the health track for a sheet (stamina + size). */
export function healthMax(sheet: CofdSheet): number {
  const stam = sheet.attributes?.stamina ?? 1;
  const size = sheet.advantages?.size ?? 5;
  return stam + size;
}

/** Total filled boxes across all damage types. */
export function totalDamage(track: HealthTrack): number {
  return (track.bashing ?? 0) + (track.lethal ?? 0) + (track.aggravated ?? 0);
}

function cloneTrack(t: HealthTrack): HealthTrack {
  return {
    bashing: t.bashing ?? 0,
    lethal: t.lethal ?? 0,
    aggravated: t.aggravated ?? 0,
  };
}

/**
 * Apply `amount` boxes of damage of `type` to the track.
 *
 * Free boxes fill first. Once the track is full, heavier damage upgrades the
 * lightest existing damage one box at a time (bashing -> lethal -> aggravated),
 * never exceeding `max` total boxes.
 */
export function applyDamage(
  track: HealthTrack,
  amount: number,
  type: DamageType,
  max: number,
): HealthTrack {
  const out = cloneTrack(track);
  if (amount <= 0 || max <= 0) return out;

  for (let i = 0; i < amount; i++) {
    const total = out.bashing + out.lethal + out.aggravated;
    if (total < max) {
      // There's free space -- just add a box of this type.
      out[type] += 1;
      continue;
    }
    // Track is full. Heavier damage upgrades lighter damage from the left.
    if (type === "lethal") {
      if (out.bashing > 0) {
        out.bashing -= 1;
        out.lethal += 1;
      }
      // No bashing left and incoming is lethal: nothing happens (lethal on
      // lethal/agg track is absorbed, but worst case it pushes off bashing).
    } else if (type === "aggravated") {
      if (out.bashing > 0) {
        out.bashing -= 1;
        out.aggravated += 1;
      } else if (out.lethal > 0) {
        out.lethal -= 1;
        out.aggravated += 1;
      }
    }
    // Bashing on a full track does nothing (no lighter type to upgrade).
  }

  return out;
}

/**
 * Heal `amount` boxes from the track.
 *
 * If `type` is a specific damage type, heal that type only.
 * If `type === "any"`, heal the heaviest type first (aggravated > lethal >
 * bashing).
 */
export function healDamage(
  track: HealthTrack,
  amount: number,
  type: DamageType | "any",
): HealthTrack {
  const out = cloneTrack(track);
  if (amount <= 0) return out;

  let remaining = amount;
  if (type === "any") {
    const order: DamageType[] = ["aggravated", "lethal", "bashing"];
    for (const t of order) {
      if (remaining <= 0) break;
      const take = Math.min(out[t], remaining);
      out[t] -= take;
      remaining -= take;
    }
  } else {
    const take = Math.min(out[type], remaining);
    out[type] -= take;
  }
  return out;
}

/**
 * Returns the wound penalty (0, -1, -2, or -3) for the given track.
 *
 * Worst applicable wins. The penalty fires when the three rightmost boxes are
 * filled with ANY damage. Penalty maps to box position:
 *   - last box damaged             -> -3
 *   - second-to-last box damaged   -> -2
 *   - third-to-last box damaged    -> -1
 *   - otherwise                    ->  0
 */
export function woundPenalty(track: HealthTrack, max: number): number {
  if (max < 3) return 0;
  const filled = totalDamage(track);
  if (filled >= max) return -3;
  if (filled >= max - 1) return -2;
  if (filled >= max - 2) return -1;
  return 0;
}

/**
 * Wound-penalty magnitude (0..3) for a full sheet. Returns the positive number
 * of dice to subtract from any pool the actor rolls.
 *
 * CoFD 2e: the three rightmost filled boxes apply -1 / -2 / -3 per box from
 * the right. Worst applicable wins; penalties do NOT stack.
 *
 * TODO: applied via buildPool() for combat rolls and via parseRollExpression()
 * for trait rolls. Out-of-band rolls (worker scripts, system rolls) need to
 * call this helper explicitly.
 */
export function sheetWoundPenalty(sheet: CofdSheet): number {
  const track = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const stam = sheet.attributes?.stamina ?? 1;
  const size = sheet.advantages?.size ?? 5;
  const max = stam + size;
  return -woundPenalty(track, max);
}
