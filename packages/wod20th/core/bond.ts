// core/bond.ts -- Blood bond (1-3 drinks toward a regnant).

import type { IWoDChar } from "./types.ts";
import { isKindred, kindredBlockMessage } from "./kindred.ts";
import { isUnbondable } from "./meritsHooks.ts";

export interface IBondResult {
  ok: boolean;
  message: string;
  level?: number;
  regnantId?: string;
}

/** Current bond level to a regnant (0 if none). */
export function bondLevel(thrall: IWoDChar, regnantId: string): number {
  const n = thrall.bonds?.[regnantId];
  return typeof n === "number" && n > 0 ? Math.min(3, n) : 0;
}

/**
 * One drink of regnant's blood toward the bond (max 3).
 * thrall may be Kindred or mortal/ghoul.
 */
export function deepenBond(
  thrall: IWoDChar,
  regnant: IWoDChar,
): IBondResult {
  if (!isKindred(regnant)) {
    return { ok: false, message: "Regnant must be Kindred." };
  }
  if (thrall.id === regnant.id) {
    return { ok: false, message: "Cannot bond yourself." };
  }
  if (isUnbondable(thrall)) {
    return {
      ok: false,
      message: "Unbondable: immune to blood bonds.",
    };
  }
  if (isKindred(thrall)) {
    const block = kindredBlockMessage(thrall, "drink of the bond");
    if (block) return { ok: false, message: block };
  }
  const cur = bondLevel(thrall, regnant.id);
  if (cur >= 3) {
    return {
      ok: true,
      message: "Full blood bond (3) already in place.",
      level: 3,
      regnantId: regnant.id,
    };
  }
  const next = cur + 1;
  thrall.bonds = { ...(thrall.bonds ?? {}), [regnant.id]: next };
  const labels = [
    "",
    "one drink -- affection / interest",
    "two drinks -- strong loyalty",
    "three drinks -- full blood bond",
  ];
  return {
    ok: true,
    message: `Blood bond -> ${next}/3 (${labels[next]}).`,
    level: next,
    regnantId: regnant.id,
  };
}

/** Staff or willpower montage: break one step or full clear. */
export function weakenBond(
  thrall: IWoDChar,
  regnantId: string,
  full = false,
): IBondResult {
  const cur = bondLevel(thrall, regnantId);
  if (cur < 1) {
    return { ok: false, message: "No bond to that regnant." };
  }
  if (full || cur <= 1) {
    const next = { ...(thrall.bonds ?? {}) };
    delete next[regnantId];
    thrall.bonds = Object.keys(next).length ? next : undefined;
    return {
      ok: true,
      message: "Blood bond broken.",
      level: 0,
      regnantId,
    };
  }
  thrall.bonds = { ...(thrall.bonds ?? {}), [regnantId]: cur - 1 };
  return {
    ok: true,
    message: `Blood bond weakened to ${cur - 1}/3.`,
    level: cur - 1,
    regnantId,
  };
}

export function listBonds(char: IWoDChar): Array<{ id: string; level: number }> {
  const b = char.bonds ?? {};
  return Object.entries(b)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([id, level]) => ({ id, level: level as number }))
    .sort((a, b) => b.level - a.level);
}
