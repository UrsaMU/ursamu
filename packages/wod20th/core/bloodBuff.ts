// core/bloodBuff.ts -- Spend Blood to raise Physical attrs (V20).

import type { IWoDChar } from "./types.ts";
import { isKindred, kindredBlockMessage } from "./kindred.ts";
import { spendPool } from "./pools.ts";
import { generationRow } from "../splats/vtm/data/generation.ts";

export type PhysicalAttr = "Strength" | "Dexterity" | "Stamina";

const PHYSICAL: readonly PhysicalAttr[] = [
  "Strength",
  "Dexterity",
  "Stamina",
];

export function parsePhysicalAttr(raw: string): PhysicalAttr | null {
  const q = raw.toLowerCase().trim();
  if (q === "str" || q === "strength") return "Strength";
  if (q === "dex" || q === "dexterity") return "Dexterity";
  if (q === "sta" || q === "stamina") return "Stamina";
  return null;
}

function traitMax(char: IWoDChar): number {
  const gen = char.generation ?? 13;
  return generationRow(gen).traitMax;
}

/**
 * Spend 1 Blood to raise one Physical attribute by 1 for the scene.
 * Capped at generation traitMax (permanent + buff).
 */
export function bloodBuffAttr(
  char: IWoDChar,
  attr: PhysicalAttr,
): {
  ok: boolean;
  message: string;
  bloodLeft?: number;
  rating?: number;
} {
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred buff with blood." };
  }
  const block = kindredBlockMessage(char, "buff");
  if (block) return { ok: false, message: block };

  const permanent = 1 + (char.attributes[attr] ?? 0);
  const curBuff = char.bloodBuff?.[attr] ?? 0;
  const next = permanent + curBuff + 1;
  const max = traitMax(char);
  if (next > max) {
    return {
      ok: false,
      message:
        `${attr} is at trait max (${max}) with current buffs.`,
    };
  }

  const spend = spendPool(char, "blood", 1);
  if (!spend.ok || spend.remaining === undefined) {
    return { ok: false, message: spend.message };
  }
  char.bloodPool = spend.remaining;
  char.bloodBuff = {
    ...(char.bloodBuff ?? {}),
    [attr]: curBuff + 1,
  };
  return {
    ok: true,
    message:
      `Blood buff: ${attr} +1 -> ${next} ` +
      `(-1 Blood -> ${spend.remaining}/${char.bloodMax}).`,
    bloodLeft: spend.remaining,
    rating: next,
  };
}

/** Clear all blood buffs (end of scene / staff). */
export function clearBloodBuff(char: IWoDChar): {
  ok: boolean;
  message: string;
} {
  if (!char.bloodBuff || Object.keys(char.bloodBuff).length === 0) {
    return { ok: false, message: "No blood buffs active." };
  }
  char.bloodBuff = undefined;
  return { ok: true, message: "Blood buffs cleared." };
}

export function formatBloodBuff(char: IWoDChar): string {
  const b = char.bloodBuff;
  if (!b) return "(none)";
  const parts: string[] = [];
  for (const a of PHYSICAL) {
    const n = b[a];
    if (n && n > 0) parts.push(`${a}+${n}`);
  }
  return parts.length ? parts.join(", ") : "(none)";
}

export { PHYSICAL };
