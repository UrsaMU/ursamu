// core/actions.ts -- Multi-action declaration ("pool splitting") for combat.
//
// Canon WoD20 Revised: declare N actions in your turn; each action's roll
// is reduced by (N - 1) dice. Default N = 1 (no penalty). The split tax
// shaves one die off EVERY action you take this turn, not just later ones.
//
// State lives on IWoDChar.actionDecl. Each +attack consumes a slot, and a
// consumed declared +defend (abort or split-defense) also consumes a slot.
// When `used >= count` the declaration auto-clears.
//
// Pure: no I/O. The command layer is responsible for persisting.

import type { IWoDChar } from "./types.ts";

export interface IActionDecl {
  count: number;
  used: number;
  setAt: number;
}

/** Dice penalty applied to every action this turn under the current decl. */
export function splitPenalty(char: IWoDChar): number {
  const d = char.actionDecl;
  if (!d || d.count <= 1) return 0;
  return d.count - 1;
}

/** Slots remaining; Infinity when no decl is set. */
export function slotsRemaining(char: IWoDChar): number {
  const d = char.actionDecl;
  if (!d) return Number.POSITIVE_INFINITY;
  return Math.max(0, d.count - d.used);
}

/** Set a fresh action declaration. Pass count >= 1. */
export function declareSplit(char: IWoDChar, count: number): IActionDecl {
  const n = Math.max(1, Math.floor(count));
  char.actionDecl = { count: n, used: 0, setAt: Date.now() };
  return char.actionDecl;
}

/**
 * Consume one action slot. Returns true if the declaration was cleared
 * (slot was the last one). When there is no declaration, this is a
 * no-op and returns false.
 */
export function consumeAction(char: IWoDChar): boolean {
  const d = char.actionDecl;
  if (!d) return false;
  d.used += 1;
  if (d.used >= d.count) {
    char.actionDecl = undefined;
    return true;
  }
  return false;
}

/** Drop the declaration without consuming slots. */
export function clearActionDecl(char: IWoDChar): void {
  char.actionDecl = undefined;
}
