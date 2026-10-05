/**
 * Engagement range vs weapon effective range (book range guide).
 * +range sets metres; +attack applies PB / out-of-range Glitch.
 */
import rangeGuide from "../data/range-guide.json" with {
  type: "json",
};
import type { SprawlItemData } from "../db/schemas.ts";

const GUIDE = rangeGuide as Array<{
  rangeM: number;
  weapons: string;
}>;

/** Point-blank band (metres). */
export const PB_M = 1;
/** Close band for shotguns / short work (metres). */
export const CLOSE_M = 5;

export type RangeBand = "pb" | "close" | "ok" | "long" | "oor";

export function guideRows(): typeof GUIDE {
  return GUIDE;
}

/** Weapon effective range from item or catalog-ish fields. */
export function weaponRangeM(
  d: Pick<SprawlItemData, "category" | "slug" | "kind"> & {
    rangeM?: number;
    notes?: string;
  },
): number | null {
  if (d.rangeM != null && Number.isFinite(Number(d.rangeM))) {
    return Number(d.rangeM);
  }
  const cat = String(d.category ?? "").toLowerCase();
  const slug = String(d.slug ?? "").toLowerCase();
  const blob = `${cat} ${slug}`;
  if (/sniper|haunt|barrett|heavy|lmg|rpg/.test(blob)) {
    return 1000;
  }
  if (/rifle|assault|kr-16|g40|gl\b/.test(blob)) return 300;
  if (/smg|leong|incinerator/.test(blob)) return 100;
  if (/handgun|pistol|revolver|shotgun|12g/.test(blob)) {
    return 50;
  }
  if (d.kind === "firearm" || d.kind === "heavy") return 100;
  return null;
}

export function bandAt(
  engageM: number,
  weaponMaxM: number | null,
): RangeBand {
  const m = Math.max(0, engageM);
  if (m <= PB_M) return "pb";
  if (m <= CLOSE_M) return "close";
  if (weaponMaxM == null) return "ok";
  if (m > weaponMaxM) return "oor";
  // Outer quarter of envelope feels stretched
  if (m > weaponMaxM * 0.75) return "long";
  return "ok";
}

export type RangeMod = {
  band: RangeBand;
  bonus: number;
  glitch: number;
  parts: string[];
  /** Suggest shotgun band for specialty. */
  shotgunBand?: "pb" | "close" | "range";
};

/**
 * Mods for current engagement vs this weapon.
 * PB ≤1m → +3; close ≤5m shotgun-friendly; OOR → Glitch.
 */
export function rangeAttackMod(
  engageM: number | undefined | null,
  weapon: Parameters<typeof weaponRangeM>[0] | null,
): RangeMod | null {
  if (engageM == null || !Number.isFinite(engageM)) return null;
  const wMax = weapon ? weaponRangeM(weapon) : null;
  const band = bandAt(Number(engageM), wMax);
  const parts: string[] = [`range ${engageM}m`];
  let bonus = 0;
  let glitch = 0;
  let shotgunBand: RangeMod["shotgunBand"];

  if (band === "pb") {
    bonus = 3;
    parts.push("pb+3");
    shotgunBand = "pb";
  } else if (band === "close") {
    shotgunBand = "close";
    parts.push("close");
  } else if (band === "long") {
    parts.push("long");
  } else if (band === "oor") {
    glitch = 1;
    parts.push("OOR glitch");
  } else {
    shotgunBand = "range";
  }

  return { band, bonus, glitch, parts, shotgunBand };
}
