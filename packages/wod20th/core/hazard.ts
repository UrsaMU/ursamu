// core/hazard.ts -- Fire / sunlight environmental damage (VtM).

import type { IWoDChar } from "./types.ts";
import { applyDamage } from "./health.ts";
import { maybeEnterTorpor, isKindred } from "./kindred.ts";
import { sunDamageBonus } from "./clanWeakness.ts";

export type HazardKind = "fire" | "sun";

export interface IHazardDef {
  kind: HazardKind;
  label: string;
  damageType: "A";
  /** Default boxes when amount omitted. */
  defaultBoxes: number;
  /** +beast/fear trigger key. */
  fearTrigger: string;
  book: string;
}

export const HAZARDS: Record<HazardKind, IHazardDef> = {
  fire: {
    kind: "fire",
    label: "Open flame",
    damageType: "A",
    defaultBoxes: 1,
    fearTrigger: "fire",
    book: "V20 p.282",
  },
  sun: {
    kind: "sun",
    label: "Direct sunlight",
    damageType: "A",
    defaultBoxes: 2,
    fearTrigger: "sunlight",
    book: "V20 p.282",
  },
};

export function parseHazardKind(raw: string): HazardKind | null {
  const q = raw.toLowerCase().trim();
  if (q === "fire" || q === "flame" || q === "burn") return "fire";
  if (q === "sun" || q === "sunlight" || q === "daylight") return "sun";
  return null;
}

export interface IHazardResult {
  ok: boolean;
  message: string;
  kind?: HazardKind;
  applied?: number;
  overflow?: number;
  enteredTorpor?: boolean;
  fearHint?: string;
}

/**
 * Apply fire or sun aggravated damage. Pure; caller saves.
 * Kindred may slip into torpor if Incap + L/A.
 */
export function applyHazard(
  char: IWoDChar,
  kind: HazardKind,
  boxes?: number,
): IHazardResult {
  const def = HAZARDS[kind];
  let n = boxes !== undefined
    ? Math.max(1, Math.floor(boxes))
    : def.defaultBoxes;
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, message: "Amount must be a positive integer." };
  }
  // Setite (and similar): extra sunlight damage.
  let clanNote = "";
  if (kind === "sun" && isKindred(char)) {
    const bonus = sunDamageBonus(char);
    if (bonus > 0) {
      n += bonus;
      clanNote = ` (+${bonus} clan sunlight weakness)`;
    }
  }
  const overflow = applyDamage(char, def.damageType, n);
  const applied = n - Math.max(0, overflow);
  let enteredTorpor = false;
  if (isKindred(char) && maybeEnterTorpor(char)) {
    enteredTorpor = true;
  }
  const fearHint =
    `Resist Rötschreck: +beast/fear ${def.fearTrigger}`;
  const torporNote = enteredTorpor ? " Entered torpor." : "";
  return {
    ok: true,
    kind,
    applied: n,
    overflow,
    enteredTorpor,
    fearHint,
    message:
      `${def.label}: ${n} aggravated${clanNote}` +
      (overflow > 0 ? ` (${overflow} overflow)` : "") +
      `.${torporNote} ${fearHint}`,
  };
}
