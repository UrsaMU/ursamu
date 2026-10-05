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
import vampireTpl from "../../templates/vampire.json" with { type: "json" };
import fetchTpl from "../../templates/fetch.json" with { type: "json" };
import hobgoblinTpl from "../../templates/hobgoblin.json" with { type: "json" };
import huntsmanTpl from "../../templates/huntsman.json" with { type: "json" };
import { vitaeMaxForBp } from "../vitae/table.ts";

export const COFD_TEMPLATES: Record<string, CofdTemplate> = {};

const rawTemplates = [
  mortalTpl,
  changelingTpl,
  werewolfTpl,
  vampireTpl,
  fetchTpl,
  hobgoblinTpl,
  huntsmanTpl,
];

for (const data of rawTemplates) {
  let energyMaxFormula: (ps: number) => number;
  if (data.key === "vampire") {
    // VtR BP table (BP 10 = 75 Vitae, not the generic 100).
    energyMaxFormula = vitaeMaxForBp;
  } else if ((data as { energyMaxFormulaType?: string })
    .energyMaxFormulaType === "standard") {
    energyMaxFormula = getStandardMaxEnergy;
  } else {
    energyMaxFormula = (ps: number) => ps;
  }
  COFD_TEMPLATES[data.key] = {
    key: data.key,
    name: data.name,
    moralityName: data.moralityName,
    powerStatName: data.powerStatName,
    energyName: data.energyName,
    customFields: data.customFields,
    validPowers: data.validPowers,
    energyMaxFormula,
  };
}

/**
 * Templates players may pick in chargen (+cg / web). Full catalog
 * stays in COFD_TEMPLATES for sheets, NPCs, and staff tools.
 * Werewolf (and staff lineages) stay implemented but closed for now.
 */
export const CHARGEN_TEMPLATE_KEYS = [
  "mortal",
  "changeling",
  "vampire",
] as const;

export function isChargenTemplate(key: string): boolean {
  const k = key.toLowerCase().trim();
  return (CHARGEN_TEMPLATE_KEYS as readonly string[]).includes(k);
}

/** Ordered playable templates for chargen lists and web cards. */
export function chargenTemplates(): CofdTemplate[] {
  const out: CofdTemplate[] = [];
  for (const k of CHARGEN_TEMPLATE_KEYS) {
    const t = COFD_TEMPLATES[k];
    if (t) out.push(t);
  }
  return out;
}
