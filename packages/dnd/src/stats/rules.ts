/**
 * Shared combat/check helpers: d20 with adv, inspiration spend.
 */
import type { DndAbility, DndSheet } from "./dnd_sheet.ts";
import type { AdvState } from "./conditions.ts";

/** PHB XP thresholds by character level (index = level). */
const XP_THRESHOLDS = [
  0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000,
  64000, 85000, 100000, 120000, 140000, 165000, 195000,
  225000, 265000, 305000, 355000,
];

export function getXpRequired(level: number): number {
  if (level <= 1) return 0;
  if (level > 20) return Infinity;
  return XP_THRESHOLDS[level] ?? Infinity;
}

export function addXp(
  sheet: DndSheet,
  amount: number,
): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n === 0) return s;
  s.xp = Math.max(0, (s.xp || 0) + n);
  return s;
}

/** Spellcasting ability from primary class name. */
export function spellcastingAbility(
  sheet: DndSheet,
): DndAbility {
  const raw = (sheet.class || "").toLowerCase()
    .split("/")[0].trim();
  if (
    raw.includes("wizard") || raw.includes("artificer")
  ) {
    return "intelligence";
  }
  if (
    raw.includes("bard") || raw.includes("sorcerer") ||
    raw.includes("warlock") || raw.includes("paladin")
  ) {
    return "charisma";
  }
  return "wisdom";
}

export function rollD20(
  rng: () => number = Math.random,
): number {
  return Math.floor(rng() * 20) + 1;
}

/**
 * Roll d20 with advantage/disadvantage.
 * Returns { roll, detail }.
 */
export function rollD20Adv(
  adv: AdvState,
  rng: () => number = Math.random,
): { roll: number; detail: string; usedAdv: AdvState } {
  if (adv === "normal") {
    const r = rollD20(rng);
    return { roll: r, detail: `d20(${r})`, usedAdv: "normal" };
  }
  const a = rollD20(rng);
  const b = rollD20(rng);
  if (adv === "advantage") {
    const roll = Math.max(a, b);
    return {
      roll,
      detail: `d20(${a},${b}) adv→${roll}`,
      usedAdv: "advantage",
    };
  }
  const roll = Math.min(a, b);
  return {
    roll,
    detail: `d20(${a},${b}) dis→${roll}`,
    usedAdv: "disadvantage",
  };
}

/** Spend inspiration to force advantage (if available). */
export function maybeSpendInspiration(
  sheet: DndSheet,
  wantInsp: boolean,
  current: AdvState,
): { sheet: DndSheet; adv: AdvState; spent: boolean } {
  if (!wantInsp || !sheet.inspiration) {
    return { sheet, adv: current, spent: false };
  }
  const s = structuredClone(sheet) as DndSheet;
  s.inspiration = false;
  // Inspiration grants advantage; cancels with existing dis → normal
  let adv: AdvState = current;
  if (current === "disadvantage") adv = "normal";
  else if (current === "normal") adv = "advantage";
  // already advantage stays advantage
  return { sheet: s, adv, spent: true };
}

export function setInspiration(
  sheet: DndSheet,
  on: boolean,
): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  s.inspiration = on;
  return s;
}

export function setExhaustion(
  sheet: DndSheet,
  level: number,
): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  s.exhaustion = Math.max(0, Math.min(6, Math.floor(level)));
  return s;
}

export function adjustExhaustion(
  sheet: DndSheet,
  delta: number,
): DndSheet {
  return setExhaustion(
    sheet,
    (sheet.exhaustion ?? 0) + delta,
  );
}
