// Aspirations subsystem -- pure functions over CofdSheet.
//
// CoFD 2e characters carry up to three (3) active Aspirations: typically two
// short-term and one long-term. Fulfilling an Aspiration grants 1 Beat and
// frees a slot for the player to write a new one (replacement is
// player-driven and ST-approved, so it is not enforced here).

import type { Aspiration, CofdSheet } from "../stats/sheet.ts";
import { addBeats } from "../xp/index.ts";

/** Maximum active Aspirations per CoFD 2e core. */
export const MAX_ASPIRATIONS = 3;

/** Error thrown when add exceeds MAX_ASPIRATIONS. */
export class AspirationCapacityError extends Error {
  constructor() {
    super(`A character may carry at most ${MAX_ASPIRATIONS} active Aspirations.`);
    this.name = "AspirationCapacityError";
  }
}

/**
 * Add an Aspiration. Throws `AspirationCapacityError` when the slot count is
 * already at MAX. The caller decides short- vs long-term; CoFD 2e suggests
 * 2 short + 1 long but enforces no split.
 */
export function addAspiration(
  sheet: CofdSheet,
  text: string,
  shortTerm: boolean,
): CofdSheet {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    throw new Error("Aspiration text may not be empty.");
  }
  const list = sheet.aspirations ?? [];
  if (list.length >= MAX_ASPIRATIONS) {
    throw new AspirationCapacityError();
  }
  const entry: Aspiration = { text: trimmed, shortTerm };
  return { ...sheet, aspirations: [...list, entry] };
}

/**
 * Remove the Aspiration at the given zero-based index. Out-of-range indices
 * return the sheet unchanged (no-op).
 */
export function removeAspiration(sheet: CofdSheet, index: number): CofdSheet {
  const list = sheet.aspirations ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return sheet;
  }
  const next = list.slice(0, index).concat(list.slice(index + 1));
  return { ...sheet, aspirations: next };
}

/**
 * Fulfill the Aspiration at the given index: remove it and award 1 Beat.
 * Out-of-range indices are a no-op: `{ sheet, beatsAwarded: 0 }`.
 */
export function fulfillAspiration(
  sheet: CofdSheet,
  index: number,
): { sheet: CofdSheet; beatsAwarded: number } {
  const list = sheet.aspirations ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return { sheet, beatsAwarded: 0 };
  }
  const removed = removeAspiration(sheet, index);
  const out = addBeats(removed, 1, false);
  return { sheet: out, beatsAwarded: 1 };
}
