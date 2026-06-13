// Parses a CoFD dice pool expression against a template-driven sheet.

import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  COFD_MENTAL_SKILLS,
  type CofdAttribute,
  type CofdSkill,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import { migrateSheet, type CofdSheet } from "../stats/sheet.ts";
import { healthMax, woundPenalty } from "../health/index.ts";

/** A single resolved trait token (attribute / skill / power / morality / etc). */
export interface ResolvedTrait {
  /** Display label, e.g. "Strength", "Brawl/Boxing", "Blood Potency". */
  label: string;
  /** Total numeric value including specialty bonus if any. */
  value: number;
  /** Base trait value before any specialty bonus. */
  base: number;
  /** Specialty name, if the token matched a skill specialty the sheet owns. */
  specialty?: string;
}

/**
 * Resolves a single lowercase trait token to its label and value on the
 * sheet, or null if the token is not a known trait. Mirrors the trait
 * vocabulary accepted by parseRollExpression, so +prove and +roll see the
 * same set of names.
 *
 * Untrained-skill penalty is NOT applied here -- consumers like +prove
 * want the raw owned value, not a roll-pool view.
 */
export function resolveTrait(token: string, sheet: CofdSheet): ResolvedTrait | null {
  sheet = migrateSheet(sheet);
  const t = token.toLowerCase().trim();
  if (!t) return null;
  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  // Skill with specialty: "skill/spec"
  if (t.includes("/")) {
    const [skillName, ...rest] = t.split("/");
    const specName = rest.join("/");
    if (!(COFD_SKILLS as readonly string[]).includes(skillName)) return null;
    const base = sheet.skills[skillName as CofdSkill] || 0;
    const owned = (sheet.specialties[skillName] || []).find((s) =>
      s.toLowerCase() === specName
    );
    if (!owned) return null;
    return {
      label: `${titleCase(skillName)}/${owned}`,
      base,
      value: base + 1,
      specialty: owned,
    };
  }

  if ((COFD_ATTRIBUTES as readonly string[]).includes(t)) {
    const v = sheet.attributes[t as CofdAttribute] || 1;
    return { label: titleCase(t), base: v, value: v };
  }
  if ((COFD_SKILLS as readonly string[]).includes(t)) {
    const v = sheet.skills[t as CofdSkill] || 0;
    return { label: titleCase(t), base: v, value: v };
  }

  const powerAliases = [tmpl.powerStatName.toLowerCase()];
  if (tmpl.powerStatName === "Blood Potency") powerAliases.push("bp");
  if (tmpl.powerStatName === "Primal Urge") powerAliases.push("pu");
  if (powerAliases.includes(t)) {
    const v = sheet.powerStatValue || 0;
    return { label: tmpl.powerStatName, base: v, value: v };
  }
  if (t === tmpl.moralityName.toLowerCase()) {
    const v = sheet.moralityValue || 0;
    return { label: tmpl.moralityName, base: v, value: v };
  }
  if (tmpl.validPowers.includes(t)) {
    const v = sheet.powers[t] || 0;
    return { label: titleCase(t), base: v, value: v };
  }
  if (t === "willpower" || t === "wp") {
    return {
      label: "Willpower",
      base: sheet.advantages.willpowerCurrent,
      value: sheet.advantages.willpowerCurrent,
    };
  }
  return null;
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (_m, c) => c.toUpperCase());
}

export interface ParsedRoll {
  pool: number;
  terms: string[];
  appliedSpecialties: string[];
  untrainedPenaltyApplied: number;
  error?: string;
}

/**
 * Parses a dice pool expression against the template-driven sheet.
 * Supports rolling dynamic attributes, skills, specialties, custom fields, power stats, and supernatural powers.
 */
export function parseRollExpression(expr: string, sheet: CofdSheet): ParsedRoll {
  sheet = migrateSheet(sheet);
  const cleanExpr = expr.toLowerCase().replace(/\s+/g, "");
  if (!cleanExpr) {
    return { pool: 0, terms: [], appliedSpecialties: [], untrainedPenaltyApplied: 0, error: "Empty roll expression." };
  }

  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  // Check if it's a raw dice pool number
  if (/^[+-]?\d+$/.test(cleanExpr)) {
    const rawPool = parseInt(cleanExpr, 10);
    return {
      pool: rawPool,
      terms: [`Raw Pool (${rawPool})`],
      appliedSpecialties: [],
      untrainedPenaltyApplied: 0
    };
  }

  let pool = 0;
  const terms: string[] = [];
  const appliedSpecialties: string[] = [];
  let untrainedPenaltyApplied = 0;

  const regex = /([+-]?)([a-z0-9_/]+)/g;
  let match;

  while ((match = regex.exec(cleanExpr)) !== null) {
    const sign = match[1] || "+";
    const token = match[2];

    // Check if numeric modifier
    if (/^\d+$/.test(token)) {
      const modifier = parseInt(token, 10);
      const value = sign === "-" ? -modifier : modifier;
      pool += value;
      terms.push(`${sign}${modifier}`);
      continue;
    }

    // Check if skill with specialty (e.g. "crafts/automotive")
    if (token.includes("/")) {
      const parts = token.split("/");
      const skillName = parts[0];
      const specName = parts.slice(1).join("/");

      if (!(COFD_SKILLS as readonly string[]).includes(skillName)) {
        return { pool: 0, terms: [], appliedSpecialties: [], untrainedPenaltyApplied: 0, error: `Invalid skill: '${skillName}'.` };
      }

      const dots = sheet.skills[skillName as CofdSkill] || 0;
      let termVal = dots;

      // Handle untrained penalty
      if (dots === 0) {
        const isMental = (COFD_MENTAL_SKILLS as readonly string[]).includes(skillName);
        const penalty = isMental ? -3 : -1;
        untrainedPenaltyApplied += penalty;
        termVal += penalty;
        terms.push(`${skillName}(0, Untrained ${penalty})`);
      } else {
        terms.push(`${skillName}(${dots})`);
      }

      // Check specialty
      const playerSpecs = sheet.specialties[skillName] || [];
      if (playerSpecs.some(s => s.toLowerCase() === specName)) {
        termVal += 1;
        appliedSpecialties.push(`${skillName}/${specName}`);
        terms.push(`Specialty:${specName}(+1)`);
      }

      pool += sign === "-" ? -termVal : termVal;
      continue;
    }

    // Check if pure Attribute
    if ((COFD_ATTRIBUTES as readonly string[]).includes(token)) {
      const dots = sheet.attributes[token as CofdAttribute] || 1;
      pool += sign === "-" ? -dots : dots;
      terms.push(`${token}(${dots})`);
      continue;
    }

    // Check if pure Skill
    if ((COFD_SKILLS as readonly string[]).includes(token)) {
      const dots = sheet.skills[token as CofdSkill] || 0;
      let termVal = dots;

      if (dots === 0) {
        const isMental = (COFD_MENTAL_SKILLS as readonly string[]).includes(token);
        const penalty = isMental ? -3 : -1;
        untrainedPenaltyApplied += penalty;
        termVal += penalty;
        terms.push(`${token}(0, Untrained ${penalty})`);
      } else {
        terms.push(`${token}(${dots})`);
      }

      pool += sign === "-" ? -termVal : termVal;
      continue;
    }

    // Check if active template's Power Stat name (or aliases like bp, pu)
    const powerAliases = [tmpl.powerStatName.toLowerCase()];
    if (tmpl.powerStatName === "Blood Potency") powerAliases.push("bp");
    if (tmpl.powerStatName === "Primal Urge") powerAliases.push("pu");
    if (powerAliases.includes(token)) {
      const dots = sheet.powerStatValue || 0;
      pool += sign === "-" ? -dots : dots;
      terms.push(`${tmpl.powerStatName}(${dots})`);
      continue;
    }

    // Check if active template's Morality trait name
    if (token === tmpl.moralityName.toLowerCase()) {
      const dots = sheet.moralityValue || 0;
      pool += sign === "-" ? -dots : dots;
      terms.push(`${tmpl.moralityName}(${dots})`);
      continue;
    }

    // Check if active template's valid Powers (e.g. vigor, forces)
    if (tmpl.validPowers.includes(token)) {
      const dots = sheet.powers[token] || 0;
      pool += sign === "-" ? -dots : dots;
      const powerTitle = token.replace(/\b\w/g, c => c.toUpperCase());
      terms.push(`${powerTitle}(${dots})`);
      continue;
    }

    return { pool: 0, terms: [], appliedSpecialties: [], untrainedPenaltyApplied: 0, error: `Unknown trait: '${token}'.` };
  }

  if (terms.length === 0) {
    return { pool: 0, terms: [], appliedSpecialties: [], untrainedPenaltyApplied: 0, error: "Could not parse any traits in roll expression." };
  }

  // Apply wound penalty automatically (skipped on raw-pool rolls -- handled by
  // the earlier `/^[+-]?\d+$/` branch which returns early).
  if (sheet.health) {
    const wp = woundPenalty(sheet.health, healthMax(sheet));
    if (wp !== 0) {
      pool += wp;
      terms.push(`Wound(${wp})`);
    }
  }

  return {
    pool,
    terms,
    appliedSpecialties,
    untrainedPenaltyApplied
  };
}
