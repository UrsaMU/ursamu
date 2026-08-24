/**
 * Concentration checks when taking damage.
 */
import {
  getAbilityMod,
  type DndSheet,
} from "./dnd_sheet.ts";

export type ConcResult = {
  sheet: DndSheet;
  broke: boolean;
  roll?: number;
  dc?: number;
  lines: string[];
};

/** Start concentrating on a spell (drops previous). */
export function startConcentration(
  sheet: DndSheet,
  spell: string,
  targetId?: string,
): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  s.concentration = {
    spell: spell.toLowerCase().trim(),
    targetId,
  };
  return s;
}

export function clearConcentration(sheet: DndSheet): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  s.concentration = null;
  return s;
}

/**
 * After damage, if concentrating: CON save DC max(10, dmg/2).
 */
export function checkConcentration(
  sheet: DndSheet,
  damageTaken: number,
  rng: () => number = Math.random,
): ConcResult {
  const s = structuredClone(sheet) as DndSheet;
  const lines: string[] = [];
  if (!s.concentration?.spell) {
    return { sheet: s, broke: false, lines };
  }
  if (damageTaken <= 0) {
    return { sheet: s, broke: false, lines };
  }

  const dc = Math.max(10, Math.floor(damageTaken / 2));
  const con = getAbilityMod(s.abilities.constitution ?? 10);
  // Exhaustion 3+ already dis on attacks; saves use ability_dis
  // simplified: single d20 + CON
  const roll = Math.floor(rng() * 20) + 1;
  const total = roll + con;
  lines.push(
    `Concentration (${s.concentration.spell}): ` +
      `d20(${roll})+${con}=${total} vs DC ${dc}.`,
  );

  if (total >= dc) {
    lines.push("Maintained concentration.");
    return {
      sheet: s,
      broke: false,
      roll,
      dc,
      lines,
    };
  }

  const spell = s.concentration.spell;
  s.concentration = null;
  lines.push(`Lost concentration on ${spell}.`);
  return { sheet: s, broke: true, roll, dc, lines };
}
