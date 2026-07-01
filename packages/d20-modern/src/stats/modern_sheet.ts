export type ModernAbility =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export const MODERN_ABILITIES: ModernAbility[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma"
];

export type ModernSkill =
  | "athletics"
  | "acrobatics"
  | "sleight_of_hand"
  | "stealth"
  | "drive"
  | "pilot"
  | "computer_use"
  | "knowledge"
  | "search"
  | "research"
  | "navigate"
  | "concentration"
  | "treat_injury"
  | "survival"
  | "perception"
  | "insight"
  | "bluff"
  | "diplomacy"
  | "intimidate"
  | "performance";

export const MODERN_SKILLS: ModernSkill[] = [
  "athletics",
  "acrobatics",
  "sleight_of_hand",
  "stealth",
  "drive",
  "pilot",
  "computer_use",
  "knowledge",
  "search",
  "research",
  "navigate",
  "concentration",
  "treat_injury",
  "survival",
  "perception",
  "insight",
  "bluff",
  "diplomacy",
  "intimidate",
  "performance"
];

export const SKILL_ABILITY_MAP: Record<ModernSkill, ModernAbility> = {
  athletics: "strength",
  acrobatics: "dexterity",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  drive: "dexterity",
  pilot: "dexterity",
  computer_use: "intelligence",
  knowledge: "intelligence",
  search: "intelligence",
  research: "intelligence",
  navigate: "intelligence",
  concentration: "constitution",
  treat_injury: "wisdom",
  survival: "wisdom",
  perception: "wisdom",
  insight: "wisdom",
  bluff: "charisma",
  diplomacy: "charisma",
  intimidate: "charisma",
  performance: "charisma"
};

export interface ModernSheet {
  class: string;
  level: number;
  occupation: string;
  abilities: Record<ModernAbility, number>;
  skills: ModernSkill[]; // Proficient skills
  feats: string[];
  hp: {
    max: number;
    current: number;
  };
  wealth: number;
  reputation: number;
  actionPoints: number;
}

export function getAbilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

// deno-lint-ignore no-explicit-any
export function migrateSheet(data: any): ModernSheet {
  const abilities = {
    strength: 8,
    dexterity: 8,
    constitution: 8,
    intelligence: 8,
    wisdom: 8,
    charisma: 8,
    ...(data?.abilities ?? {})
  };

  return {
    class: data?.class ?? "",
    level: Number(data?.level ?? 1),
    occupation: data?.occupation ?? "",
    abilities,
    skills: Array.isArray(data?.skills) ? data.skills : [],
    feats: Array.isArray(data?.feats) ? data.feats : [],
    hp: {
      max: Number(data?.hp?.max ?? 10),
      current: Number(data?.hp?.current ?? 10)
    },
    wealth: Number(data?.wealth ?? 5),
    reputation: Number(data?.reputation ?? 0),
    actionPoints: Number(data?.actionPoints ?? 5)
  };
}
