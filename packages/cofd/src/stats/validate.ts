// Validates the parsed value for a trait against the active sheet's template configuration.

import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  COFD_MERITS,
  COFD_VIRTUE_NAMES,
  COFD_VICE_NAMES,
  findVice,
  findVirtue,
  parseMeritRef,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import { checkPrerequisites } from "../support/prereq.ts";
import { defaultSheet, migrateSheet, type CofdSheet } from "./sheet.ts";

/**
 * Validates a value for setting a trait under the active sheet's template configuration.
 * Returns the parsed value, or throws an error.
 */
export function validateTraitValue(trait: string, valueStr: string, sheet?: CofdSheet): string | number {
  sheet = sheet ? migrateSheet(sheet) : defaultSheet();
  const key = trait.toLowerCase().trim();
  const valLower = valueStr.trim().toLowerCase();
  const valInt = parseInt(valLower, 10);

  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  // 1. Support Optional Value Reset Syntax (e.g. +cg/set trait=)
  if (valueStr.trim() === "") {
    if (key === "template") {
      throw new Error("Template cannot be reset to empty.");
    }
    if (COFD_ATTRIBUTES.includes(key)) {
      return 1;
    }
    if (COFD_SKILLS.includes(key)) {
      return 0;
    }
    // Reset path: accept `merit(qualifier)=` for instanced merits too.
    const resetRef = parseMeritRef(trait);
    if (COFD_MERITS.find(m => m.key === resetRef.merit)) {
      return 0;
    }
    if (tmpl.validPowers.includes(key)) {
      return 0;
    }
    if (["concept", "virtue", "vice"].includes(key)) {
      return "";
    }
    if (tmpl.customFields.includes(key)) {
      return "Not Set";
    }
    if (key === tmpl.moralityName.toLowerCase()) {
      return 7;
    }
    const powerAliases = [tmpl.powerStatName.toLowerCase()];
    if (tmpl.powerStatName === "Blood Potency") powerAliases.push("bp");
    if (tmpl.powerStatName === "Primal Urge") powerAliases.push("pu");
    if (powerAliases.includes(key)) {
      return sheet.template.toLowerCase() === "mortal" ? 0 : 1;
    }
    if (tmpl.energyName !== "None" && key === tmpl.energyName.toLowerCase()) {
      return 0;
    }
    if (key === "willpower") {
      return (sheet.attributes.resolve || 1) + (sheet.attributes.composure || 1);
    }
    if (key === "size") {
      return 5;
    }
    throw new Error(`Unknown trait: '${trait}'.`);
  }

  // 2. Standard validations
  if (key === "template") {
    if (!COFD_TEMPLATES[valLower]) {
      throw new Error(`Invalid template: '${valueStr}'. Valid templates: ${Object.keys(COFD_TEMPLATES).join(", ")}`);
    }
    return valLower;
  }

  if (COFD_ATTRIBUTES.includes(key)) {
    if (isNaN(valInt) || valInt < 1 || valInt > 10) {
      throw new Error("Attributes must be integers between 1 and 10.");
    }
    return valInt;
  }

  if (COFD_SKILLS.includes(key)) {
    if (isNaN(valInt) || valInt < 0 || valInt > 10) {
      throw new Error("Skills must be integers between 0 and 10.");
    }
    return valInt;
  }

  // Merits check (supports qualified instances: language(spanish), contacts:police)
  const meritRef = parseMeritRef(trait);
  const meritDef = COFD_MERITS.find(m => m.key === meritRef.merit);
  if (meritDef) {
    if (meritDef.instanced && !meritRef.qualifier) {
      throw new Error(`Merit '${meritDef.name}' requires a qualifier -- e.g. ${meritDef.key}(spanish).`);
    }
    if (!meritDef.instanced && meritRef.qualifier) {
      throw new Error(`Merit '${meritDef.name}' does not take a qualifier.`);
    }
    if (valInt === 0) {
      return 0;
    }
    if (isNaN(valInt) || !meritDef.allowedDots.includes(valInt)) {
      throw new Error(`Merit '${meritDef.name}' only allows ratings of: ${meritDef.allowedDots.join(", ")}`);
    }
    // Check prerequisites
    const prereqCheck = checkPrerequisites(meritDef.prereqs, sheet);
    if (!prereqCheck.valid) {
      throw new Error(`Cannot purchase '${meritDef.name}': ${prereqCheck.reason}`);
    }
    return valInt;
  }

  // Morality check
  if (key === tmpl.moralityName.toLowerCase()) {
    if (isNaN(valInt) || valInt < 1 || valInt > 10) {
      throw new Error(`${tmpl.moralityName} must be an integer between 1 and 10.`);
    }
    return valInt;
  }

  // Power Stat check (e.g. Blood Potency / BP, Gnosis, Wyrd, Primal Urge / PU)
  const powerAliases = [tmpl.powerStatName.toLowerCase()];
  if (tmpl.powerStatName === "Blood Potency") powerAliases.push("bp");
  if (tmpl.powerStatName === "Primal Urge") powerAliases.push("pu");
  if (powerAliases.includes(key)) {
    if (isNaN(valInt) || valInt < 0 || valInt > 10) {
      throw new Error(`${tmpl.powerStatName} must be an integer between 0 and 10.`);
    }
    return valInt;
  }

  // Energy check (e.g. Vitae, Glamour, Mana, Essence)
  if (tmpl.energyName !== "None" && key === tmpl.energyName.toLowerCase()) {
    if (isNaN(valInt) || valInt < 0) {
      throw new Error(`${tmpl.energyName} must be a non-negative integer.`);
    }
    return valInt;
  }

  if (key === "willpower") {
    if (isNaN(valInt) || valInt < 0) {
      throw new Error("Willpower must be a non-negative integer.");
    }
    return valInt;
  }

  if (key === "size") {
    if (isNaN(valInt) || valInt < 1 || valInt > 10) {
      throw new Error("Size must be an integer between 1 and 10.");
    }
    return valInt;
  }

  if (key === "concept") {
    return valueStr.trim();
  }

  if (key === "virtue") {
    const match = findVirtue(valueStr);
    if (!match) {
      throw new Error(
        `Invalid Virtue '${valueStr.trim()}'. Valid Virtues: ${COFD_VIRTUE_NAMES.join(", ")}.`,
      );
    }
    return match.name;
  }

  if (key === "vice") {
    const match = findVice(valueStr);
    if (!match) {
      throw new Error(
        `Invalid Vice '${valueStr.trim()}'. Valid Vices: ${COFD_VICE_NAMES.join(", ")}.`,
      );
    }
    return match.name;
  }

  // Custom Fields check (e.g. Clan, Covenant, Seeming)
  if (tmpl.customFields.includes(key)) {
    return valueStr.trim();
  }

  // Powers check (e.g. Vigor, Forces)
  if (tmpl.validPowers.includes(key)) {
    if (isNaN(valInt) || valInt < 0 || valInt > 5) {
      throw new Error("Powers must be integers between 0 and 5.");
    }
    return valInt;
  }

  throw new Error(`Unknown or read-only trait: '${trait}'.`);
}
