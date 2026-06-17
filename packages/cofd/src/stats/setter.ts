// Sets a trait value on a character sheet dynamically using the active template config.

import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  COFD_MERITS,
  parseMeritRef,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import { migrateSheet, refreshAdvantages, type CofdSheet } from "./sheet.ts";

/**
 * Sets a trait value on a character sheet dynamically matching its template.
 */
export function setTrait(sheet: CofdSheet, trait: string, value: string | number): CofdSheet {
  sheet = migrateSheet(sheet);
  const key = trait.toLowerCase().trim();

  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  if (key === "template") {
    const nextTemplate = value as string;
    sheet.template = nextTemplate;
    const nextTmpl = COFD_TEMPLATES[nextTemplate];
    if (nextTmpl) {
      sheet.powerStatValue = nextTemplate === "mortal" ? 0 : 1;
      sheet.energyCurrent = nextTmpl.energyMaxFormula(sheet.powerStatValue);
      sheet.customFields = {};
      sheet.powers = {};
    }
    sheet = refreshAdvantages(sheet);
    return sheet;
  }

  if (COFD_ATTRIBUTES.includes(key)) {
    sheet.attributes[key] = value as number;
    sheet = refreshAdvantages(sheet);
    return sheet;
  }

  if (COFD_SKILLS.includes(key)) {
    sheet.skills[key] = value as number;
    return sheet;
  }

  // Set Merits (with optional qualifier: language(spanish), contacts:police, etc.)
  const meritRef = parseMeritRef(trait);
  const meritDef = COFD_MERITS.find(m => m.key === meritRef.merit);
  if (meritDef) {
    const valInt = value as number;
    if (valInt === 0) {
      delete sheet.merits[meritRef.storageKey];
    } else {
      sheet.merits[meritRef.storageKey] = valInt;
    }
    return sheet;
  }

  if (key === tmpl.moralityName.toLowerCase()) {
    sheet.moralityValue = value as number;
    return sheet;
  }

  const powerAliases = [tmpl.powerStatName.toLowerCase()];
  if (tmpl.powerStatName === "Blood Potency") powerAliases.push("bp");
  if (tmpl.powerStatName === "Primal Urge") powerAliases.push("pu");
  if (powerAliases.includes(key)) {
    sheet.powerStatValue = value as number;
    sheet = refreshAdvantages(sheet);
    return sheet;
  }

  if (tmpl.energyName !== "None" && key === tmpl.energyName.toLowerCase()) {
    const maxVal = tmpl.energyMaxFormula(sheet.powerStatValue);
    sheet.energyCurrent = Math.min(value as number, maxVal);
    return sheet;
  }

  if (key === "willpower") {
    sheet.advantages.willpowerCurrent = Math.min(value as number, sheet.advantages.willpowerMax);
    return sheet;
  }

  if (key === "size") {
    sheet.advantages.size = value as number;
    // Speed (Str+Dex+Size) is recomputed at render time and Health max
    // (Stamina+Size) is clamped by refreshAdvantages; no persisted derived
    // fields to mutate here.
    sheet = refreshAdvantages(sheet);
    return sheet;
  }

  if (["concept", "virtue", "vice"].includes(key)) {
    const prop = key as "concept" | "virtue" | "vice";
    sheet[prop] = value as string;
    return sheet;
  }

  if (tmpl.customFields.includes(key)) {
    const valStr = value as string;
    if (valStr === "Not Set" || valStr === "") {
      delete sheet.customFields[key];
    } else {
      sheet.customFields[key] = valStr;
    }
    return sheet;
  }

  if (tmpl.validPowers.includes(key)) {
    const valInt = value as number;
    if (valInt === 0) {
      delete sheet.powers[key];
    } else {
      sheet.powers[key] = valInt;
    }
    return sheet;
  }

  throw new Error(`Trait '${trait}' cannot be set directly.`);
}
