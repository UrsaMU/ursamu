export type DndAbility = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

export const DND_ABILITIES: DndAbility[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma"
];

export type DndSkill =
  | "athletics"
  | "acrobatics"
  | "sleight_of_hand"
  | "stealth"
  | "arcana"
  | "history"
  | "investigation"
  | "nature"
  | "religion"
  | "animal_handling"
  | "insight"
  | "medicine"
  | "perception"
  | "survival"
  | "deception"
  | "intimidation"
  | "performance"
  | "persuasion";

export const DND_SKILLS: DndSkill[] = [
  "athletics",
  "acrobatics",
  "sleight_of_hand",
  "stealth",
  "arcana",
  "history",
  "investigation",
  "nature",
  "religion",
  "animal_handling",
  "insight",
  "medicine",
  "perception",
  "survival",
  "deception",
  "intimidation",
  "performance",
  "persuasion"
];

export const SKILL_ABILITY_MAP: Record<DndSkill, DndAbility> = {
  athletics: "strength",
  acrobatics: "dexterity",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  arcana: "intelligence",
  history: "intelligence",
  investigation: "intelligence",
  nature: "intelligence",
  religion: "intelligence",
  animal_handling: "wisdom",
  insight: "wisdom",
  medicine: "wisdom",
  perception: "wisdom",
  survival: "wisdom",
  deception: "charisma",
  intimidation: "charisma",
  performance: "charisma",
  persuasion: "charisma"
};

export interface DndSheet {
  class: string;
  subclass: string;
  level: number;
  classes: Record<string, number>;
  species: string;
  background: string;
  abilities: Record<DndAbility, number>;
  skillProficiency: Record<DndSkill, "none" | "proficient" | "expert">;
  savingThrowProficiency: DndAbility[];
  hp: {
    max: number;
    current: number;
    temp: number;
  };
  hitDice: {
    max: number;
    current: number;
  };
  ac: number;
  speed: number;
  equipment: string[];
  spellSlotsMax: Record<number, number>; // 1 to 9
  spellSlotsCurrent: Record<number, number>; // 1 to 9
  feats: string[];
  spells: string[];
  /** Display / vendor total in gp-equivalent (synced from money). */
  gold: number;
  /**
   * Actual purse coins. Shops spend this via spendCoins.
   * If missing but gold > 0, migrate seeds money.gp from gold.
   */
  money?: {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  };
  xp: number;
  /** Death saves + spirit/corpse travel (player death). */
  death?: {
    successes: number;
    failures: number;
    stable: boolean;
    dead: boolean;
    spirit?: boolean;
    corpseId?: string;
    deathRoomId?: string;
  };
}

export function getAbilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getProficiencyBonus(level: number): number {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
}

export function defaultSheet(): DndSheet {
  const abilities: Record<DndAbility, number> = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  };

  const skillProficiency = {} as Record<DndSkill, "none" | "proficient" | "expert">;
  for (const skill of DND_SKILLS) {
    skillProficiency[skill] = "none";
  }

  const spellSlotsMax: Record<number, number> = {};
  const spellSlotsCurrent: Record<number, number> = {};
  for (let i = 1; i <= 9; i++) {
    spellSlotsMax[i] = 0;
    spellSlotsCurrent[i] = 0;
  }

  return {
    class: "Fighter",
    subclass: "",
    level: 1,
    classes: { Fighter: 1 },
    species: "Human",
    background: "Soldier",
    abilities,
    skillProficiency,
    savingThrowProficiency: [],
    hp: {
      max: 10,
      current: 10,
      temp: 0
    },
    hitDice: {
      max: 1,
      current: 1
    },
    ac: 10,
    speed: 30,
    equipment: [],
    spellSlotsMax,
    spellSlotsCurrent,
    feats: [],
    spells: [],
    gold: 100,
    money: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 },
    xp: 0
  };
}

// deno-lint-ignore no-explicit-any
export function migrateSheet(sheet: any): DndSheet {
  const defaults = defaultSheet();
  const classes = sheet?.classes || (sheet?.class
    ? { [sheet.class]: sheet.level || 1 }
    : defaults.classes);
  const defaultHitDice = {
    max: sheet?.level || defaults.level || 1,
    current: sheet?.level || defaults.level || 1
  };
  const hitDice = sheet?.hitDice || defaultHitDice;
  const gold = typeof sheet?.gold === "number"
    ? sheet.gold
    : defaults.gold;
  const moneyIn = sheet?.money;
  const moneyEmpty = !moneyIn ||
    (
      !(moneyIn.cp || moneyIn.sp || moneyIn.ep ||
        moneyIn.gp || moneyIn.pp)
    );
  // Legacy sheets often set gold:100 with no money purse —
  // seed gp so shops can spend it.
  const money = moneyEmpty && gold > 0
    ? { cp: 0, sp: 0, ep: 0, gp: gold, pp: 0 }
    : {
      cp: Number(moneyIn?.cp) || 0,
      sp: Number(moneyIn?.sp) || 0,
      ep: Number(moneyIn?.ep) || 0,
      gp: Number(moneyIn?.gp) || 0,
      pp: Number(moneyIn?.pp) || 0,
    };
  return {
    ...defaults,
    ...sheet,
    classes,
    hitDice,
    abilities: { ...defaults.abilities, ...(sheet?.abilities || {}) },
    skillProficiency: {
      ...defaults.skillProficiency,
      ...(sheet?.skillProficiency || {}),
    },
    savingThrowProficiency: Array.isArray(sheet?.savingThrowProficiency)
      ? sheet.savingThrowProficiency
      : [],
    hp: { ...defaults.hp, ...(sheet?.hp || {}) },
    spellSlotsMax: {
      ...defaults.spellSlotsMax,
      ...(sheet?.spellSlotsMax || {}),
    },
    spellSlotsCurrent: {
      ...defaults.spellSlotsCurrent,
      ...(sheet?.spellSlotsCurrent || {}),
    },
    feats: Array.isArray(sheet?.feats) ? sheet.feats : defaults.feats,
    spells: Array.isArray(sheet?.spells) ? sheet.spells : defaults.spells,
    gold,
    money,
    xp: typeof sheet?.xp === "number" ? sheet.xp : defaults.xp,
  };
}
