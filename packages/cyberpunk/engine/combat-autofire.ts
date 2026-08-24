/**
 * Cyberpunk RED -- Autofire Range DV Tables (errata p.173)
 *
 * Autofire DVs vary by weapon class and range band. Damage on a hit is
 * 2d6 multiplied by the amount the attacker beats the DV by, capped at 4.
 */

export type AutofireWeaponClass = "smg" | "assault_rifle";

export type RangeBand =
  | "close"   // 0-6  m/yds
  | "medium"  // 7-12
  | "long"    // 13-25
  | "vlong"   // 26-50
  | "extreme"; // 51-100

export const RANGE_BAND_LABELS: Record<RangeBand, string> = {
  close:   "0-6m",
  medium:  "7-12m",
  long:    "13-25m",
  vlong:   "26-50m",
  extreme: "51-100m",
};

/** Errata p.173 -- autofire DV by weapon class and range. */
export const AUTOFIRE_DV: Record<AutofireWeaponClass, Record<RangeBand, number>> = {
  smg:            { close: 20, medium: 17, long: 20, vlong: 25, extreme: 30 },
  assault_rifle:  { close: 22, medium: 20, long: 17, vlong: 20, extreme: 25 },
};

/** Hard cap on the autofire damage multiplier (per core/errata). */
export const AUTOFIRE_SV_CAP = 4;

/**
 * Map a weapon type string to its autofire class, if any.
 * Returns null for weapons that cannot autofire.
 */
export const autofireClass = (weaponType: string): AutofireWeaponClass | null => {
  if (weaponType === "smg") return "smg";
  if (weaponType === "rifle") return "assault_rifle";
  return null;
};

/** Parse a range-band string (case-insensitive); returns null if invalid. */
export const parseRangeBand = (s: string): RangeBand | null => {
  const k = s.toLowerCase().trim();
  if (k === "close" || k === "c") return "close";
  if (k === "medium" || k === "m" || k === "med") return "medium";
  if (k === "long" || k === "l") return "long";
  if (k === "vlong" || k === "v" || k === "verylong" || k === "very_long") return "vlong";
  if (k === "extreme" || k === "x" || k === "ext") return "extreme";
  return null;
};

/** Look up the autofire DV for a weapon class at a range band. */
export const autofireDV = (cls: AutofireWeaponClass, band: RangeBand): number =>
  AUTOFIRE_DV[cls][band];
