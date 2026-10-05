import type { IMektonChar, StatKey } from "./schema.ts";
import { derivedStats, skillPointsSpent } from "./derived.ts";
import { SKILL_CATALOG } from "./catalog.ts";

export const STAT_KEYS: StatKey[] = [
  "att", "bod", "cl", "emp", "int", "luck", "ma", "ref", "tech", "edu",
];

export const HARD_SKILLS = new Set([
  "Interrogation", "Intimidate", "Persuasion & Fast Talk", "Resist Torture/Drugs",
  "Gamble", "Programming", "Shadowing/Avoid Pursuit", "Teaching",
  "Mecha Fighting", "Mecha Gunnery", "Mecha Melee", "Mecha Missiles", "Mecha Piloting",
  "Aircraft/Aeroshuttle Pilot", "Stealth", "Medical", "Mecha Design", "Mecha Tech",
  "Pick Lock", "Pickpocket",
]);

/** Validate a stat value. Returns error string or true. */
export function validateStat(stat: StatKey, value: number): true | string {
  if (!Number.isInteger(value)) return `${stat.toUpperCase()} must be a whole number.`;
  if (value < 2) return `${stat.toUpperCase()} minimum is 2.`;
  if (value > 10) return `${stat.toUpperCase()} maximum is 10.`;
  return true;
}

/** Validate a skill name. Returns normalized name or error string. */
export function validateSkillName(name: string): string | Error {
  // Allow Expert: and Know Language: with arbitrary topics
  if (/^Expert:/i.test(name) || /^Know Language:/i.test(name)) return name;
  const match = SKILL_CATALOG.find(
    (s) => s.toLowerCase() === name.toLowerCase(),
  );
  if (!match) return new Error(`Unknown skill: "${name}". Use +chargen/skills to see the catalog.`);
  return match;
}

/** Validate a skill level for chargen. Returns error string or true. */
export function validateSkillLevel(
  name: string,
  level: number,
  char: IMektonChar,
): true | string {
  if (!Number.isInteger(level) || level < 1 || level > 10) {
    return "Skill level must be 1–10.";
  }
  // Hard skill cap at +5 for chargen (career bonuses may exceed this)
  if (char.chargenStatus === "draft" && level > 5 && HARD_SKILLS.has(name)) {
    return `${name} is a Hard [H] skill and cannot exceed +5 at character creation.`;
  }
  return true;
}

/** Check if char is locked (approved). */
export function checkApproved(char: IMektonChar): boolean {
  return char.chargenStatus === "approved";
}

/** Check total stat points vs pool. Returns error or true. */
export function validateStatPool(char: IMektonChar): true | string {
  if (char.statMethod !== "concept" && char.statMethod !== "cinematic") return true;
  if (char.statPointPool === null) return true;
  const total = STAT_KEYS.reduce((sum, k) => sum + char.stats[k], 0);
  if (total > char.statPointPool) {
    return `Stat total (${total}) exceeds pool (${char.statPointPool}).`;
  }
  return true;
}

/** Check total skill points spent vs budget. Returns error or true. */
export function validateSkillPool(char: IMektonChar): true | string {
  const budget = derivedStats(char).skillPoints;
  const spent = skillPointsSpent(char.skills);
  if (spent > budget) return `Skill points spent (${spent}) exceed budget (${budget}).`;
  return true;
}

/** Return list of required fields not yet set. Empty = character is ready to submit. */
export function checkRequired(char: IMektonChar): string[] {
  const missing: string[] = [];
  if (!char.statMethod) missing.push("stat generation method (+chargen/method)");
  if (!char.charType)   missing.push("character type (+chargen/type rookie|professional)");

  const statTotal = STAT_KEYS.reduce((s, k) => s + char.stats[k], 0);
  if (statTotal < 20) missing.push("stats not set (+chargen/stat or +chargen/roll)");

  const poolCheck = validateStatPool(char);
  if (poolCheck !== true) missing.push(poolCheck);

  const skillCheck = validateSkillPool(char);
  if (skillCheck !== true) missing.push(skillCheck);

  if (!char.lifepath.parentStatus) missing.push("lifepath not started (+chargen/roll-lifepath)");

  if (char.charType === "rookie" && !char.rookieTemplate) {
    missing.push("rookie template not chosen (+chargen/template)");
  }
  if (char.charType === "professional" && char.careers.length === 0) {
    missing.push("no career terms added (+chargen/career)");
  }
  if (char.charType === "professional") {
    const incomplete = char.careers.filter((c) => c.chosenSkills.length < 5);
    if (incomplete.length > 0) {
      missing.push(`career term(s) missing skill choices (+chargen/career/skills)`);
    }
  }

  // Wounds must be initialized (checked by presence)
  if (!char.wounds) missing.push("character not fully initialized");

  return missing;
}
