// core/health.ts -- WoD20th health track logic.
// 7 slots: Bruised (0) -> Incapacitated (6).
// Heavier damage occupies the lowest indices (Bruised end); lighter is pushed right.
// Overflow bashing upgrades existing bashing to lethal (rules p.255).
// Overflow bashing on a full-lethal/agg track returns overflow > 0 (character dies/torpor).
import type { IWoDChar, DamageMark } from "./types.ts";

export const HEALTH_LEVELS = [
  "Bruised",
  "Hurt",
  "Injured",
  "Wounded",
  "Mauled",
  "Crippled",
  "Incapacitated",
] as const;

export const HEALTH_TRACK_SIZE = 7;

/** Damage severity order for upgrade logic. */
const SEVERITY: Record<DamageMark, number> = { "": 0, B: 1, L: 2, A: 3 };

/**
 * Pack filled slots left, heaviest first (aggravated at index 0).
 * Per rules: aggravated marked above lethal, lethal above bashing. No gaps.
 */
function compactTrack(track: DamageMark[]): void {
  const filled = track.filter((m) => m !== "").sort((a, b) => SEVERITY[b] - SEVERITY[a]);
  for (let i = 0; i < HEALTH_TRACK_SIZE; i++) {
    track[i] = filled[i] ?? "";
  }
}

/** Return a fresh empty health track. */
export function initTrack(): DamageMark[] {
  return Array<DamageMark>(HEALTH_TRACK_SIZE).fill("");
}

/** Get (or initialise) the health track on a character. Mutates char if track is absent. */
export function getTrack(char: IWoDChar): DamageMark[] {
  if (!char.healthTrack || char.healthTrack.length !== HEALTH_TRACK_SIZE) {
    char.healthTrack = initTrack();
  }
  return char.healthTrack;
}

/**
 * Apply `amount` points of damage to the character.
 *
 * Pass 1 -- fill empty slots (any type).
 * Pass 2 -- upgrade lighter damage slots to incoming type (e.g. B->L when lethal hits a full-bashing track).
 * Pass 3 -- bashing overflow only: upgrade remaining B slots to L
 *           (rules p.255: "additional bashing damage upgrades an existing bashing wound to lethal").
 *           If no B remains to upgrade, overflow is returned (character dies/enters torpor).
 *
 * Track is compacted after each call so heavier damage always occupies lowest indices.
 * Returns overflow boxes that could not be absorbed.
 */
export function applyDamage(char: IWoDChar, type: "B" | "L" | "A", amount: number): number {
  const track = getTrack(char);
  let remaining = amount;

  // Pass 1: fill empty slots
  for (let i = 0; i < HEALTH_TRACK_SIZE && remaining > 0; i++) {
    if (track[i] === "") { track[i] = type; remaining--; }
  }

  // Pass 2: upgrade lighter slots to incoming type (handles L/A hitting a full-bashing track, etc.)
  for (let i = 0; i < HEALTH_TRACK_SIZE && remaining > 0; i++) {
    if (track[i] !== "" && SEVERITY[track[i]] < SEVERITY[type]) { track[i] = type; remaining--; }
  }

  // Pass 3 (bashing only): overflow bashing upgrades B -> L
  if (type === "B") {
    for (let i = 0; i < HEALTH_TRACK_SIZE && remaining > 0; i++) {
      if (track[i] === "B") { track[i] = "L"; remaining--; }
    }
  }

  compactTrack(track);
  return remaining;
}

/**
 * Heal `amount` points of the given damage type.
 * Pass "all" to heal any type, lightest first.
 * Heals from the most severe occupied slot of the requested type downward.
 * Returns the number of boxes actually healed.
 */
export function healDamage(char: IWoDChar, type: DamageMark | "all", amount: number): number {
  const track = getTrack(char);
  let healed = 0;

  if (type === "all") {
    // Heal lightest damage first (bashing -> lethal -> aggravated)
    for (const t of ["B", "L", "A"] as const) {
      for (let i = HEALTH_TRACK_SIZE - 1; i >= 0 && healed < amount; i--) {
        if (track[i] === t) { track[i] = ""; healed++; }
      }
    }
  } else {
    for (let i = HEALTH_TRACK_SIZE - 1; i >= 0 && healed < amount; i--) {
      if (track[i] === type) { track[i] = ""; healed++; }
    }
  }

  compactTrack(track);
  return healed;
}

/**
 * Parse a user-supplied damage type string.
 * Returns null if the input is not recognised.
 */
export function parseDamageType(raw: string): "B" | "L" | "A" | null {
  switch (raw.trim().toLowerCase()) {
    case "b": case "bashing":              return "B";
    case "l": case "lethal":               return "L";
    case "a": case "agg": case "aggravated": return "A";
    default: return null;
  }
}

/** Damage mark -> single display character. */
export function markChar(m: DamageMark): string {
  if (m === "B") return "/";
  if (m === "L") return "X";
  if (m === "A") return "*";
  return " ";
}

/** Damage mark -> bracket display cell, e.g. "[X]". */
export function markCell(m: DamageMark): string {
  const c = markChar(m);
  return `[${c}]`;
}
