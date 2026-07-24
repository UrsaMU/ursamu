// Chronicles of Darkness (CoFD) Supernatural Template Definitions
// Dynamically loads all template definitions from JSON files within the templates/ subdirectory.

export interface CofdTemplate {
  key: string; // e.g. "vampire"
  name: string; // e.g. "Vampire: The Requiem"
  moralityName: string; // e.g. "Humanity"
  powerStatName: string; // e.g. "Blood Potency"
  energyName: string; // e.g. "Vitae"
  customFields: string[]; // e.g. ["clan", "covenant"]
  validPowers: string[]; // list of lowercase power ratings
  energyMaxFormula: (powerStatValue: number) => number;
}

/**
 * Standard Chronicles of Darkness 2nd Edition Max Energy Pool lookup.
 * Applies to Vampire (Vitae), Werewolf (Essence), Mage (Mana), Changeling (Glamour), etc.
 */
export function getStandardMaxEnergy(powerStat: number): number {
  const ps = Math.max(0, Math.min(10, Math.floor(powerStat)));
  const table: Record<number, number> = {
    0: 0,
    1: 10,
    2: 11,
    3: 12,
    4: 13,
    5: 14,
    6: 15,
    7: 20,
    8: 30,
    9: 50,
    10: 100,
  };
  return table[ps] ?? 10;
}

import mortalTpl from "../../templates/mortal.json" with { type: "json" };
import changelingTpl from "../../templates/changeling.json" with { type: "json" };
import werewolfTpl from "../../templates/werewolf.json" with { type: "json" };
import fetchTpl from "../../templates/fetch.json" with { type: "json" };
import hobgoblinTpl from "../../templates/hobgoblin.json" with { type: "json" };
import huntsmanTpl from "../../templates/huntsman.json" with { type: "json" };

export const COFD_TEMPLATES: Record<string, CofdTemplate> = {};

const rawTemplates = [mortalTpl, changelingTpl, werewolfTpl, fetchTpl, hobgoblinTpl, huntsmanTpl];

for (const data of rawTemplates) {
  COFD_TEMPLATES[data.key] = {
    key: data.key,
    name: data.name,
    moralityName: data.moralityName,
    powerStatName: data.powerStatName,
    energyName: data.energyName,
    customFields: data.customFields,
    validPowers: data.validPowers,
    energyMaxFormula: (data as any).energyMaxFormulaType === "standard"
      ? getStandardMaxEnergy
      : (ps: number) => ps,
  };
}
