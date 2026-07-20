import { addCmd, type IUrsamuSDK, header, divider, footer } from "@ursamu/ursamu";
import {
  type DndAbility,
  type DndSkill,
  DND_ABILITIES,
  DND_SKILLS,
  getAbilityMod,
  migrateSheet
} from "../stats/dnd_sheet.ts";
import { recalculateAndSaveAC } from "./inventory.ts";

export interface DndCgState {
  stage: number;
  class: string;
  species: string;
  background: string;
  abilities: Record<DndAbility, number>;
  abilityIncreases: Record<DndAbility, number>;
  chosenSkills: DndSkill[];
  chosenSpells: string[];
  chosenFeats: string[];
  startingGear?: "equipment" | "gold";
  chosenGearOptions?: number[];
}

export function initCgState(): DndCgState {
  return {
    stage: 1,
    class: "",
    species: "",
    background: "",
    abilities: {
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8
    },
    abilityIncreases: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0
    },
    chosenSkills: [],
    chosenSpells: [],
    chosenFeats: [],
    startingGear: "equipment",
    chosenGearOptions: []
  };
}

export interface EquipmentOption {
  label: string;
  items: Array<{ name: string; spec: string }>;
}

export interface EquipmentChoice {
  description: string;
  options: EquipmentOption[];
}

// D&D 2024 Classes metadata
export interface ClassData {
  hitDie: number;
  saves: DndAbility[];
  skillCount: number;
  skillOptions: DndSkill[];
  spellcasting?: {
    cantripCount: number;
    spellCount: number;
    cantripOptions: string[];
    spellOptions: string[];
  };
  startingGold: number;
  startingEquipmentChoices?: EquipmentChoice[];
}

export const CLASS_METADATA: Record<string, ClassData> = {
  barbarian: {
    hitDie: 12,
    saves: ["strength", "constitution"],
    skillCount: 2,
    skillOptions: [
      "animal_handling",
      "athletics",
      "intimidation",
      "nature",
      "perception",
      "survival",
    ],
    startingGold: 75,
    startingEquipmentChoices: [
      {
        description: "Choose a primary martial weapon",
        options: [
          {
            label: "Greatsword",
            items: [{ name: "Greatsword", spec: "weapon:2d6:slashing" }],
          },
          {
            label: "Greataxe",
            items: [{ name: "Greataxe", spec: "weapon:1d12:slashing" }],
          },
        ],
      },
      {
        description: "Choose secondary gear",
        options: [
          {
            label: "Two Handaxes",
            items: [
              { name: "Handaxe (L)", spec: "weapon:1d6:slashing:light" },
              { name: "Handaxe (R)", spec: "weapon:1d6:slashing:light" },
            ],
          },
          {
            label: "Scale Mail + Handaxe",
            items: [
              { name: "Scale Mail", spec: "armor:14:medium" },
              { name: "Handaxe", spec: "weapon:1d6:slashing:light" },
            ],
          },
        ],
      },
    ],
  },
  bard: {
    hitDie: 8,
    saves: ["dexterity", "charisma"],
    skillCount: 3,
    skillOptions: DND_SKILLS,
    spellcasting: {
      cantripCount: 2,
      spellCount: 4,
      cantripOptions: [
        "light",
        "mage_hand",
        "prestidigitation",
        "vicious_mockery",
      ],
      spellOptions: [
        "charm_person",
        "cure_wounds",
        "dissonant_whispers",
        "healing_word",
        "thunderwave",
      ],
    },
    startingGold: 100,
    startingEquipmentChoices: [
      {
        description: "Choose a weapon",
        options: [
          {
            label: "Rapier",
            items: [{ name: "Rapier", spec: "weapon:1d8:piercing:finesse" }],
          },
          {
            label: "Shortsword",
            items: [
              {
                name: "Shortsword",
                spec: "weapon:1d6:piercing:finesse:light",
              },
            ],
          },
        ],
      },
      {
        description: "Choose starting armor/packs",
        options: [
          {
            label: "Leather Armor + Dagger",
            items: [
              { name: "Leather Armor", spec: "armor:11:light" },
              {
                name: "Dagger",
                spec: "weapon:1d4:piercing:finesse:light",
              },
            ],
          },
        ],
      },
    ],
  },
  cleric: {
    hitDie: 8,
    saves: ["wisdom", "charisma"],
    skillCount: 2,
    skillOptions: ["history", "insight", "medicine", "persuasion", "religion"],
    spellcasting: {
      cantripCount: 3,
      spellCount: 4,
      cantripOptions: [
        "guidance",
        "sacred_flame",
        "spare_the_dying",
        "thaumaturgy",
      ],
      spellOptions: [
        "bless",
        "cure_wounds",
        "guiding_bolt",
        "healing_word",
        "shield_of_faith",
      ],
    },
    startingGold: 110,
    startingEquipmentChoices: [
      {
        description: "Choose a weapon",
        options: [
          {
            label: "Mace",
            items: [{ name: "Mace", spec: "weapon:1d6:bludgeoning" }],
          },
          {
            label: "Warhammer",
            items: [{ name: "Warhammer", spec: "weapon:1d8:bludgeoning" }],
          },
        ],
      },
      {
        description: "Choose starting armor",
        options: [
          {
            label: "Scale Mail + Steel Shield",
            items: [
              { name: "Scale Mail", spec: "armor:14:medium" },
              { name: "Steel Shield", spec: "shield:2" },
            ],
          },
          {
            label: "Chain Mail + Steel Shield",
            items: [
              { name: "Chain Mail", spec: "armor:16:heavy" },
              { name: "Steel Shield", spec: "shield:2" },
            ],
          },
        ],
      },
    ],
  },
  druid: {
    hitDie: 8,
    saves: ["intelligence", "wisdom"],
    skillCount: 2,
    skillOptions: [
      "arcana",
      "animal_handling",
      "insight",
      "medicine",
      "nature",
      "perception",
      "religion",
      "survival",
    ],
    spellcasting: {
      cantripCount: 2,
      spellCount: 4,
      cantripOptions: [
        "druidcraft",
        "guidance",
        "produce_flame",
        "shillelagh",
      ],
      spellOptions: ["cure_wounds", "entangle", "healing_word", "thunderwave"],
    },
    startingGold: 50,
    startingEquipmentChoices: [
      {
        description: "Choose a primary tool/weapon",
        options: [
          {
            label: "Quarterstaff",
            items: [
              { name: "Quarterstaff", spec: "weapon:1d6:bludgeoning" },
            ],
          },
          {
            label: "Dagger",
            items: [
              {
                name: "Dagger",
                spec: "weapon:1d4:piercing:finesse:light",
              },
            ],
          },
        ],
      },
      {
        description: "Choose armor/shield option",
        options: [
          {
            label: "Leather Armor + Wooden Shield",
            items: [
              { name: "Leather Armor", spec: "armor:11:light" },
              { name: "Wooden Shield", spec: "shield:2" },
            ],
          },
        ],
      },
    ],
  },
  fighter: {
    hitDie: 10,
    saves: ["strength", "constitution"],
    skillCount: 2,
    skillOptions: [
      "acrobatics",
      "animal_handling",
      "athletics",
      "history",
      "insight",
      "intimidation",
      "perception",
      "survival",
    ],
    startingGold: 125,
    startingEquipmentChoices: [
      {
        description: "Choose offensive gear",
        options: [
          {
            label: "Longsword + Steel Shield",
            items: [
              { name: "Longsword", spec: "weapon:1d8:slashing" },
              { name: "Steel Shield", spec: "shield:2" },
            ],
          },
          {
            label: "Greatsword",
            items: [{ name: "Greatsword", spec: "weapon:2d6:slashing" }],
          },
        ],
      },
      {
        description: "Choose defensive gear",
        options: [
          {
            label: "Chain Mail",
            items: [{ name: "Chain Mail", spec: "armor:16:heavy" }],
          },
          {
            label: "Scale Mail",
            items: [{ name: "Scale Mail", spec: "armor:14:medium" }],
          },
        ],
      },
    ],
  },
  monk: {
    hitDie: 8,
    saves: ["strength", "dexterity"],
    skillCount: 2,
    skillOptions: [
      "acrobatics",
      "athletics",
      "history",
      "insight",
      "religion",
      "stealth",
    ],
    startingGold: 25,
    startingEquipmentChoices: [
      {
        description: "Choose a simple weapon",
        options: [
          {
            label: "Shortsword",
            items: [
              {
                name: "Shortsword",
                spec: "weapon:1d6:piercing:finesse:light",
              },
            ],
          },
          {
            label: "Quarterstaff",
            items: [
              { name: "Quarterstaff", spec: "weapon:1d6:bludgeoning" },
            ],
          },
        ],
      },
    ],
  },
  paladin: {
    hitDie: 10,
    saves: ["wisdom", "charisma"],
    skillCount: 2,
    skillOptions: [
      "athletics",
      "insight",
      "intimidation",
      "medicine",
      "persuasion",
      "religion",
    ],
    startingGold: 140,
    startingEquipmentChoices: [
      {
        description: "Choose offensive gear",
        options: [
          {
            label: "Longsword + Steel Shield",
            items: [
              { name: "Longsword", spec: "weapon:1d8:slashing" },
              { name: "Steel Shield", spec: "shield:2" },
            ],
          },
          {
            label: "Greatsword",
            items: [{ name: "Greatsword", spec: "weapon:2d6:slashing" }],
          },
        ],
      },
      {
        description: "Choose armor option",
        options: [
          {
            label: "Chain Mail",
            items: [{ name: "Chain Mail", spec: "armor:16:heavy" }],
          },
          {
            label: "Scale Mail",
            items: [{ name: "Scale Mail", spec: "armor:14:medium" }],
          },
        ],
      },
    ],
  },
  ranger: {
    hitDie: 10,
    saves: ["strength", "dexterity"],
    skillCount: 3,
    skillOptions: [
      "athletics",
      "insight",
      "investigation",
      "nature",
      "perception",
      "stealth",
      "survival",
    ],
    startingGold: 100,
    startingEquipmentChoices: [
      {
        description: "Choose starting armor",
        options: [
          {
            label: "Scale Mail",
            items: [{ name: "Scale Mail", spec: "armor:14:medium" }],
          },
          {
            label: "Leather Armor",
            items: [{ name: "Leather Armor", spec: "armor:11:light" }],
          },
        ],
      },
      {
        description: "Choose weapon loadout",
        options: [
          {
            label: "Two Shortswords",
            items: [
              {
                name: "Shortsword (L)",
                spec: "weapon:1d6:piercing:finesse:light",
              },
              {
                name: "Shortsword (R)",
                spec: "weapon:1d6:piercing:finesse:light",
              },
            ],
          },
          {
            label: "Shortbow",
            items: [
              {
                name: "Shortbow",
                spec: "weapon:1d6:piercing:ranged,two_handed",
              },
            ],
          },
        ],
      },
    ],
  },
  rogue: {
    hitDie: 8,
    saves: ["dexterity", "intelligence"],
    skillCount: 4,
    skillOptions: [
      "acrobatics",
      "athletics",
      "deception",
      "insight",
      "intimidation",
      "investigation",
      "perception",
      "performance",
      "persuasion",
      "sleight_of_hand",
      "stealth",
    ],
    startingGold: 100,
    startingEquipmentChoices: [
      {
        description: "Choose a primary weapon",
        options: [
          {
            label: "Rapier",
            items: [{ name: "Rapier", spec: "weapon:1d8:piercing:finesse" }],
          },
          {
            label: "Shortsword",
            items: [
              {
                name: "Shortsword",
                spec: "weapon:1d6:piercing:finesse:light",
              },
            ],
          },
        ],
      },
      {
        description: "Choose auxiliary gear",
        options: [
          {
            label: "Leather Armor + Two Daggers",
            items: [
              { name: "Leather Armor", spec: "armor:11:light" },
              {
                name: "Dagger (L)",
                spec: "weapon:1d4:piercing:finesse:light",
              },
              {
                name: "Dagger (R)",
                spec: "weapon:1d4:piercing:finesse:light",
              },
            ],
          },
        ],
      },
    ],
  },
  sorcerer: {
    hitDie: 6,
    saves: ["constitution", "charisma"],
    skillCount: 2,
    skillOptions: [
      "arcana",
      "deception",
      "insight",
      "intimidation",
      "persuasion",
      "religion",
    ],
    spellcasting: {
      cantripCount: 4,
      spellCount: 2,
      cantripOptions: [
        "acid_splash",
        "fire_bolt",
        "mage_hand",
        "prestidigitation",
        "shocking_grasp",
      ],
      spellOptions: [
        "burning_hands",
        "chromatic_orb",
        "magic_missile",
        "shield",
        "thunderwave",
      ],
    },
    startingGold: 75,
    startingEquipmentChoices: [
      {
        description: "Choose weapon option",
        options: [
          {
            label: "Light Crossbow",
            items: [
              {
                name: "Light Crossbow",
                spec: "weapon:1d8:piercing:ranged,loading,two_handed",
              },
            ],
          },
          {
            label: "Dagger",
            items: [
              {
                name: "Dagger",
                spec: "weapon:1d4:piercing:finesse:light",
              },
            ],
          },
        ],
      },
    ],
  },
  warlock: {
    hitDie: 8,
    saves: ["wisdom", "charisma"],
    skillCount: 2,
    skillOptions: [
      "arcana",
      "deception",
      "history",
      "intimidation",
      "investigation",
      "nature",
      "religion",
    ],
    spellcasting: {
      cantripCount: 2,
      spellCount: 2,
      cantripOptions: [
        "eldritch_blast",
        "mage_hand",
        "minor_illusion",
        "prestidigitation",
      ],
      spellOptions: ["armor_of_agathys", "arms_of_hadar", "hex", "witch_bolt"],
    },
    startingGold: 75,
    startingEquipmentChoices: [
      {
        description: "Choose weapon package",
        options: [
          {
            label: "Leather Armor + Dagger",
            items: [
              { name: "Leather Armor", spec: "armor:11:light" },
              {
                name: "Dagger",
                spec: "weapon:1d4:piercing:finesse:light",
              },
            ],
          },
          {
            label: "Leather Armor + Mace",
            items: [
              { name: "Leather Armor", spec: "armor:11:light" },
              { name: "Mace", spec: "weapon:1d6:bludgeoning" },
            ],
          },
        ],
      },
    ],
  },
  wizard: {
    hitDie: 6,
    saves: ["intelligence", "wisdom"],
    skillCount: 2,
    skillOptions: [
      "arcana",
      "history",
      "insight",
      "investigation",
      "medicine",
      "religion",
    ],
    spellcasting: {
      cantripCount: 3,
      spellCount: 4,
      cantripOptions: [
        "fire_bolt",
        "light",
        "mage_hand",
        "minor_illusion",
        "prestidigitation",
        "ray_of_frost",
      ],
      spellOptions: [
        "burning_hands",
        "mage_armor",
        "magic_missile",
        "shield",
        "sleep",
        "thunderwave",
      ],
    },
    startingGold: 75,
    startingEquipmentChoices: [
      {
        description: "Choose primary weapon",
        options: [
          {
            label: "Quarterstaff",
            items: [
              { name: "Quarterstaff", spec: "weapon:1d6:bludgeoning" },
            ],
          },
          {
            label: "Dagger",
            items: [
              {
                name: "Dagger",
                spec: "weapon:1d4:piercing:finesse:light",
              },
            ],
          },
        ],
      },
    ],
  },
};


// D&D 2024 Backgrounds metadata
export interface BackgroundData {
  skills: DndSkill[];
  fixedIncreases: Record<DndAbility, number>;
  feat: string;
}

export const BACKGROUND_METADATA: Record<string, BackgroundData> = {
  acolyte: {
    skills: ["insight", "religion"],
    fixedIncreases: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 2, charisma: 1 },
    feat: "Magic Initiate (Cleric)"
  },
  soldier: {
    skills: ["athletics", "intimidation"],
    fixedIncreases: { strength: 2, dexterity: 0, constitution: 1, intelligence: 0, wisdom: 0, charisma: 0 },
    feat: "Savage Attacker"
  },
  sage: {
    skills: ["arcana", "history"],
    fixedIncreases: { strength: 0, dexterity: 0, constitution: 0, intelligence: 2, wisdom: 1, charisma: 0 },
    feat: "Magic Initiate (Wizard)"
  },
  criminal: {
    skills: ["deception", "stealth"],
    fixedIncreases: { strength: 0, dexterity: 2, constitution: 1, intelligence: 0, wisdom: 0, charisma: 0 },
    feat: "Alert"
  },
  guide: {
    skills: ["stealth", "survival"],
    fixedIncreases: { strength: 0, dexterity: 1, constitution: 0, intelligence: 0, wisdom: 2, charisma: 0 },
    feat: "Skilled"
  },
  merchant: {
    skills: ["animal_handling", "persuasion"],
    fixedIncreases: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 1, charisma: 2 },
    feat: "Lucky"
  }
};

// Point Buy cost table
const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9
};

export const ORIGIN_FEATS = [
  "alert",
  "crafter",
  "healer",
  "lucky",
  "magic_initiate_cleric",
  "magic_initiate_druid",
  "magic_initiate_wizard",
  "musician",
  "savage_attacker",
  "skilled",
  "tough"
];

export function validateAbilityScores(abilities: Record<DndAbility, number>): { valid: boolean; error?: string } {
  // Check if Point Buy
  let totalCost = 0;
  for (const ab of DND_ABILITIES) {
    const val = abilities[ab];
    if (val < 8 || val > 15) {
      return { valid: false, error: `Ability scores under Point Buy must be between 8 and 15 (got ${ab}=${val}).` };
    }
    totalCost += POINT_BUY_COSTS[val];
  }

  if (totalCost === 27) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid ability scores. Must use exactly 27 Point Buy points (current cost: ${totalCost}/27).`
  };
}

export function getStageInstructions(u: IUrsamuSDK, name: string, state: DndCgState, feedback?: string): string {
  const fb = feedback ? `  ${feedback}\n\n` : "";
  if (state.stage === 1) {
    return `\n${header("CHARACTER CREATION: STAGE 1")}
${fb}  Welcome ${name}! Step 1 of Character Creation is choosing your Class.

  %cyCurrent Class:%cn ${state.class ? `%cg${state.class}%cn` : "(none chosen)"}

  To view available classes, type:
    %ch+cg/list classes%cn
${divider("INSTRUCTIONS")}
  Set your class using:
    %ch+cg/set class=<class name>%cn (e.g. +cg/set class=Wizard)
${footer()}

When finished, type %ch+cg/next%cn to proceed.`;
  }

  if (state.stage === 2) {
    return `\n${header("CHARACTER CREATION: STAGE 2")}
${fb}  Step 2: Choose your Origin (Species and Background).

  %cySpecies:%cn    ${state.species ? `%cg${state.species}%cn` : "(none chosen)"}
  %cyBackground:%cn ${state.background ? `%cg${state.background}%cn` : "(none chosen)"}

  To view available options, type:
    %ch+cg/list species%cn
    %ch+cg/list backgrounds%cn
${divider("INSTRUCTIONS")}
  Set species and background using:
    %ch+cg/set species=<species>%cn
    %ch+cg/set background=<background>%cn
${footer()}

When finished, type %ch+cg/next%cn to proceed.`;
  }

  if (state.stage === 3) {
    const abShort = {
      strength: "STR",
      dexterity: "DEX",
      constitution: "CON",
      intelligence: "INT",
      wisdom: "WIS",
      charisma: "CHA"
    };

    let totalCost = 0;
    for (const ab of DND_ABILITIES) {
      totalCost += POINT_BUY_COSTS[state.abilities[ab]] ?? 0;
    }

    const abStrings = DND_ABILITIES.map((a) => {
      const total = state.abilities[a] + state.abilityIncreases[a];
      const mod = getAbilityMod(total);
      const sign = mod >= 0 ? "+" : "";
      return `  %cy${abShort[a]}%cn: ${total.toString().padStart(2)} (${sign}${mod})`;
    });

    const formattedRows: string[] = [];
    for (let i = 0; i < abStrings.length; i += 4) {
      const slice = abStrings.slice(i, i + 4);
      const rowStr = slice.map((item) => u.util.ljust(item, 18)).join("");
      formattedRows.push(rowStr);
    }
    const abList = formattedRows.join("\n");

    return `\n${header("CHARACTER CREATION: STAGE 3")}
${fb}  Step 3: Determine Ability Scores using Point Buy.
  Purchase scores between 8 and 15.

  %cyPoints Left:%cn ${27 - totalCost}

${abList}
${divider("INSTRUCTIONS")}
  Set a base score using:
    %ch+cg/set <ability>=<value>%cn (e.g. +cg/set Strength=15)
${footer()}

When finished, type %ch+cg/next%cn to proceed to Skills.`;
  }

  if (state.stage === 4) {
    const cls = CLASS_METADATA[state.class.toLowerCase()];
    const bg = BACKGROUND_METADATA[state.background.toLowerCase()];
    const bgSkills = bg ? bg.skills.join(", ") : "";
    const chosenList = state.chosenSkills.join(", ") || "(none chosen)";

    return `\n${header("CHARACTER CREATION: STAGE 4")}
${fb}  Step 4: Choose Skill Proficiencies.

  %cyBackground Skills (Auto):%cn %cg${bgSkills}%cn
  %cyClass Options (${state.class}):%cn choose %cg${cls?.skillCount ?? 0}%cn from:
    ${cls?.skillOptions.join(", ")}

  %cyChosen Skills:%cn %cg${chosenList}%cn
${divider("INSTRUCTIONS")}
  Add or remove a class skill:
    %ch+cg/set skill=<skill name>%cn (e.g. +cg/set skill=athletics)
${footer()}

When finished, type %ch+cg/next%cn to proceed to Feats.`;
  }

  const isCaster = state.class ? !!CLASS_METADATA[state.class.toLowerCase()]?.spellcasting : false;
  const gearStage = isCaster ? 7 : 6;
  const reviewStage = isCaster ? 8 : 7;

  if (state.stage === 5) {
    const bg = BACKGROUND_METADATA[state.background.toLowerCase()];
    const maxFeats = state.species.toLowerCase() === "human" ? 2 : 1;
    const defaultFeat = bg?.feat || "None";
    const chosenList = state.chosenFeats.length > 0 
      ? state.chosenFeats.map(f => f.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")).join(", ")
      : `${defaultFeat} (default)`;

    return `\n${header("CHARACTER CREATION: STAGE 5")}
${fb}  Step 5: Select Origin Feats.
  Your background grants 1 Feat. Humans receive 1 additional Feat.
  Feats budget: %cy${maxFeats}%cn

  %cyBackground Default Feat:%cn  %cg${defaultFeat}%cn
  %cyChosen Feats:%cn             %cg${chosenList}%cn
${divider("INSTRUCTIONS")}
  Choose or change a feat:
    %ch+cg/set feat=<feat name>%cn (e.g. +cg/set feat=tough)
    To see available options: %ch+cg/list feats%cn
${footer()}

When finished, type %ch+cg/next%cn to proceed.`;
  }

  if (state.stage === 6) {
    if (isCaster) {
      const cls = CLASS_METADATA[state.class.toLowerCase()];
      const spellcasting = cls?.spellcasting;
      const cantripList =
        spellcasting?.cantripOptions
          .map((c) =>
            c
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
          )
          .join(", ") || "";
      const lvl1List =
        spellcasting?.spellOptions
          .map((s) =>
            s
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
          )
          .join(", ") || "";

      const chosenCantrips = state.chosenSpells.filter((s) =>
        spellcasting?.cantripOptions.includes(s)
      );
      const chosenLvl1 = state.chosenSpells.filter((s) =>
        spellcasting?.spellOptions.includes(s)
      );

      const chosenCantripNames =
        chosenCantrips
          .map((s) =>
            s
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
          )
          .join(", ") || "(none)";
      const chosenSpellNames =
        chosenLvl1
          .map((s) =>
            s
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
          )
          .join(", ") || "(none)";

      return `\n${header("CHARACTER CREATION: STAGE 6")}
${fb}  Step 6: Choose Cantrips and 1st-Level Spells.

  %cyCantrip Options (Choose ${spellcasting?.cantripCount}):%cn
    ${cantripList}
  %cy1st-Level Spell Options (Choose ${spellcasting?.spellCount}):%cn
    ${lvl1List}

  %cyChosen Cantrips:%cn %cg${chosenCantripNames}%cn
  %cyChosen Spells:%cn   %cg${chosenSpellNames}%cn
${divider("INSTRUCTIONS")}
  Add or remove a spell/cantrip:
    %ch+cg/set spell=<spell name>%cn (e.g. +cg/set spell=fire_bolt)
${footer()}

When finished, type %ch+cg/next%cn to proceed.`;
    }
  }

  if (state.stage === gearStage) {
    const cls = CLASS_METADATA[state.class.toLowerCase()];
    const startingGoldAmt = cls?.startingGold ?? 100;
    const currentGearChoice = state.startingGear
      ? `%cg${state.startingGear}%cn`
      : "(none chosen)";

    const lines: string[] = [
      header(`CHARACTER CREATION: STAGE ${gearStage}`),
      `${fb}  Step ${gearStage}: Choose Starting Gear.`,
      `  Choose standard equipment or starting gold (${startingGoldAmt} gp).`,
      ``,
      `  %cyGeneral Choice:%cn ${currentGearChoice}`,
    ];

    if (state.startingGear === "equipment" && cls?.startingEquipmentChoices) {
      lines.push(divider("Equipment Package Options"));
      cls.startingEquipmentChoices.forEach((choice, choiceIdx) => {
        lines.push(`  %cyChoice ${choiceIdx + 1}: ${choice.description}%cn`);
        const chosenOptIdx = state.chosenGearOptions?.[choiceIdx];
        choice.options.forEach((opt, optIdx) => {
          const prefix = chosenOptIdx === optIdx ? "    %cg[X]%cn " : "    [ ] ";
          lines.push(`${prefix}${optIdx + 1}: ${opt.label}`);
        });
        lines.push("");
      });
      lines.push(divider("INSTRUCTIONS"));
      lines.push("  Configure choice using: %ch+cg/set gear<choice_num>=<option_num>%cn");
      lines.push("  e.g., +cg/set gear1=1");
    } else {
      lines.push(divider("INSTRUCTIONS"));
      lines.push("  Choose starting gear type:");
      lines.push("    %ch+cg/set gear=equipment%cn");
      lines.push("    %ch+cg/set gear=gold%cn");
    }

    lines.push(footer());
    lines.push(`When finished, type %ch+cg/next%cn to proceed.`);
    return lines.join("\n");
  }

  if (state.stage === reviewStage) {
    const bg = BACKGROUND_METADATA[state.background.toLowerCase()];
    const cls = CLASS_METADATA[state.class.toLowerCase()];

    // Combine base + background increase
    const abShort = {
      strength: "STR",
      dexterity: "DEX",
      constitution: "CON",
      intelligence: "INT",
      wisdom: "WIS",
      charisma: "CHA",
    };

    const abStrings = DND_ABILITIES.map((a) => {
      const total = state.abilities[a] + state.abilityIncreases[a];
      const mod = getAbilityMod(total);
      const sign = mod >= 0 ? "+" : "";
      return `  %cy${abShort[a]}%cn: ${total
        .toString()
        .padStart(2)} (${sign}${mod})`;
    });

    const formattedRows: string[] = [];
    for (let i = 0; i < abStrings.length; i += 4) {
      const slice = abStrings.slice(i, i + 4);
      const rowStr = slice.map((item) => u.util.ljust(item, 18)).join("");
      formattedRows.push(rowStr);
    }
    const abList = formattedRows.join("\n");

    const allSkills = [...(bg?.skills || []), ...state.chosenSkills];
    const defaultFeat = bg?.feat || "None";
    const featStr =
      state.chosenFeats.length > 0
        ? state.chosenFeats
            .map((f) =>
              f
                .split("_")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
            )
            .join(", ")
        : defaultFeat;

    // Columnize Skills list (4 columns, width 18)
    const skillNames = allSkills.map((s) =>
      s
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    );
    const formattedSkills: string[] = [];
    for (let i = 0; i < skillNames.length; i += 4) {
      const slice = skillNames.slice(i, i + 4);
      const rowStr = slice
        .map((item) => u.util.ljust(`  * ${item}`, 18))
        .join("");
      formattedSkills.push(rowStr);
    }
    const skillsListStr = formattedSkills.join("\n");

    // Columnize Spells list (4 columns, width 18)
    const spellNames = state.chosenSpells.map((s) =>
      s
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    );
    const formattedSpells: string[] = [];
    for (let i = 0; i < spellNames.length; i += 4) {
      const slice = spellNames.slice(i, i + 4);
      const rowStr = slice
        .map((item) => u.util.ljust(`  * ${item}`, 18))
        .join("");
      formattedSpells.push(rowStr);
    }
    const spellsListStr =
      spellNames.length > 0 ? formattedSpells.join("\n") : "  None";

    let gearChoiceStr =
      state.startingGear === "gold"
        ? `Starting Gold (${cls?.startingGold} gp)`
        : "Class Equipment (plus 10 gp)";

    if (state.startingGear === "equipment" && cls?.startingEquipmentChoices) {
      const chosenLabels: string[] = [];
      cls.startingEquipmentChoices.forEach((choice, choiceIdx) => {
        const optIdx = state.chosenGearOptions?.[choiceIdx] ?? 0;
        const opt = choice.options[optIdx];
        if (opt) {
          chosenLabels.push(opt.label);
        }
      });
      if (chosenLabels.length > 0) {
        gearChoiceStr += ` [Chosen: ${chosenLabels.join(", ")}]`;
      }
    }

    return `\n${header(`CHARACTER CREATION: STAGE ${reviewStage}`)}
${fb}  Step ${reviewStage}: Review and Finalize.

  %cyClass:%cn      ${state.class} (Hit Die: d${cls?.hitDie}, Saves: ${cls?.saves.join(", ")})
  %cySpecies:%cn    ${state.species}
  %cyBackground:%cn ${state.background} (Feats: ${featStr})
  %cyStarting Gear:%cn ${gearChoiceStr}

${abList}

  %cySkills:%cn
${skillsListStr}

  %cySpells:%cn
${spellsListStr}
${divider("INSTRUCTIONS")}
  To start over, run %ch+cg/reset%cn.
${footer()}

If everything is correct, finalize your character sheet by typing: %ch+cg/submit%cn`;
  }

  return `Invalid Chargen Stage. Run +cg/reset to start over.`;
}

export function handleList(u: IUrsamuSDK, rawArg: string): boolean {
  const topic = rawArg.toLowerCase().trim();
  if (!topic) {
    u.send(
      header("CHARGEN TOPICS") + "\n" +
      "  Available lists to view:\n" +
      "    * %cyclasses%cn\n" +
      "    * %cyspecies%cn\n" +
      "    * %cybackgrounds%cn\n" +
      "    * %cyskills%cn\n" +
      "    * %cyspells%cn\n" +
      "    * %cyfeats%cn\n\n" +
      "  Type: %ch+cg/list <topic>%cn to view.\n" +
      footer()
    );
    return true;
  }
  
  if (topic === "classes") {
    const classNames = Object.keys(CLASS_METADATA).map(c => c.charAt(0).toUpperCase() + c.slice(1));
    const formatted: string[] = [];
    for (let i = 0; i < classNames.length; i += 3) {
      const slice = classNames.slice(i, i + 3);
      const rowStr = slice.map((item, idx) => {
        if (idx === 0) return u.util.ljust(`  * ${item}`, 24);
        if (idx === 1) return u.util.ljust(`* ${item}`, 24);
        return u.util.ljust(`* ${item}`, 24);
      }).join("");
      formatted.push(rowStr);
    }
    u.send(
      header("CLASSES") + "\n" +
      formatted.join("\n") + "\n" +
      footer()
    );
    return true;
  }
  
  if (topic === "species") {
    u.send(
      header("SPECIES") + "\n" +
      "  * Human\n  * Elf\n  * Dwarf\n  * Halfling\n" +
      footer()
    );
    return true;
  }
  
  if (topic === "backgrounds") {
    const bgNames = Object.keys(BACKGROUND_METADATA).map(b => b.charAt(0).toUpperCase() + b.slice(1));
    const formatted: string[] = [];
    for (let i = 0; i < bgNames.length; i += 2) {
      const slice = bgNames.slice(i, i + 2);
      const rowStr = slice.map((item, idx) => {
        const bgMeta = BACKGROUND_METADATA[item.toLowerCase()];
        const skillStr = bgMeta ? bgMeta.skills.join(", ") : "";
        const desc = `${item} (Skills: ${skillStr})`;
        if (idx === 0) return u.util.ljust(`  * ${desc}`, 38);
        return u.util.ljust(`* ${desc}`, 38);
      }).join("");
      formatted.push(rowStr);
    }
    u.send(
      header("BACKGROUNDS") + "\n" +
      formatted.join("\n") + "\n" +
      footer()
    );
    return true;
  }

  if (topic === "skills") {
    const skillNames = DND_SKILLS.map(s => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
    const formatted: string[] = [];
    for (let i = 0; i < skillNames.length; i += 3) {
      const slice = skillNames.slice(i, i + 3);
      const rowStr = slice.map((item, idx) => {
        if (idx === 0) return u.util.ljust(`  * ${item}`, 24);
        if (idx === 1) return u.util.ljust(`* ${item}`, 24);
        return u.util.ljust(`* ${item}`, 24);
      }).join("");
      formatted.push(rowStr);
    }
    u.send(
      header("SKILLS") + "\n" +
      formatted.join("\n") + "\n" +
      footer()
    );
    return true;
  }

  if (topic === "spells") {
    u.send(
      header("SPELLS") + "\n" +
      "  Cantrips:\n" +
      "    * Fire Bolt, Guidance, Light, Mage Hand, Minor Illusion,\n" +
      "      Prestidigitation, Produce Flame, Ray of Frost, Sacred Flame,\n" +
      "      Spare the Dying, Thaumaturgy, Vicious Mockery, Shillelagh, Druidcraft\n\n" +
      "  1st-Level Spells:\n" +
      "    * Bless, Burning Hands, Cure Wounds, Dissonant Whispers, Guiding Bolt,\n" +
      "      Healing Word, Hex, Mage Armor, Magic Missile, Shield,\n" +
      "      Shield of Faith, Sleep, Thunderwave, Witch Bolt, Entangle\n" +
      footer()
    );
    return true;
  }

  if (topic === "feats") {
    const featNames = ORIGIN_FEATS.map(f => f.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
    const formatted: string[] = [];
    for (let i = 0; i < featNames.length; i += 2) {
      const slice = featNames.slice(i, i + 2);
      const rowStr = slice.map((item, idx) => {
        if (idx === 0) return u.util.ljust(`  * ${item}`, 38);
        return u.util.ljust(`* ${item}`, 38);
      }).join("");
      formatted.push(rowStr);
    }
    u.send(
      header("FEATS") + "\n" +
      formatted.join("\n") + "\n" +
      footer()
    );
    return true;
  }
  
  return false;
}

export async function dndCgExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rawArg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const target = u.me;

  if (sw === "list") {
    const handled = handleList(u, rawArg);
    if (!handled) {
      u.send(
        header("CHARGEN ERROR") + "\n" +
        `  Error: Unknown list topic: "${rawArg}".\n` +
        `  Valid topics: %cyclasses%cn, %cyspecies%cn, %cybackgrounds%cn, %cyskills%cn.\n` +
        footer()
      );
    }
    return;
  }

  let cgState = target.state?.dnd_cg as DndCgState | undefined;

  if (sw === "reset") {
    if (target.state?.dnd) {
      u.send("You already have an approved character sheet.");
      return;
    }
    cgState = initCgState();
    await u.db.modify(target.id, "$set", { "data.dnd_cg": cgState });
    u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%cgYour character generation state has been reset.%cn"));
    return;
  }

  if (!cgState) {
    if (target.state?.dnd) {
      u.send(header("CHARACTER CREATION") + "\n" +
             " You already have a character sheet. If you want to start over, run:\n" +
             "   %ch+cg/reset%cn\n\n" +
             " %crWARNING: This will NOT delete your approved sheet unless you submit and complete the new one.%cn\n" +
             footer());
      return;
    }
    cgState = initCgState();
    await u.db.modify(target.id, "$set", { "data.dnd_cg": cgState });
    u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState));
    return;
  }

  const isCaster = cgState.class ? !!CLASS_METADATA[cgState.class.toLowerCase()]?.spellcasting : false;
  const gearStage = isCaster ? 7 : 6;
  const reviewStage = isCaster ? 8 : 7;
  let feedback = "";
  let isError = false;

  if (sw === "set") {
    if (!rawArg.includes("=")) {
      feedback = "Usage: +cg/set <trait>=<value> (e.g. +cg/set class=Wizard)";
      isError = true;
    } else {
      const eqIndex = rawArg.indexOf("=");
      const key = rawArg.slice(0, eqIndex).trim().toLowerCase();
      const value = rawArg.slice(eqIndex + 1).trim();

      if (cgState.stage === 1) {
        if (key === "class") {
          const clsLower = value.toLowerCase();
          if (!CLASS_METADATA[clsLower]) {
            feedback = `Unknown class "${value}". Valid: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard.`;
            isError = true;
          } else {
            cgState.class = value;
            feedback = `Class set to ${value}.`;
          }
        } else {
          feedback = "In Stage 1, you can only set: class.";
          isError = true;
        }
      } else if (cgState.stage === 2) {
        if (key === "species") {
          const spLower = value.toLowerCase();
          const validSpecies = ["human", "elf", "dwarf", "halfling"];
          if (!validSpecies.includes(spLower)) {
            feedback = `Unknown species "${value}". Valid: Human, Elf, Dwarf, Halfling.`;
            isError = true;
          } else {
            cgState.species = value;
            feedback = `Species set to ${value}.`;
          }
        } else if (key === "background") {
          const bgLower = value.toLowerCase();
          const bgMeta = BACKGROUND_METADATA[bgLower];
          if (!bgMeta) {
            feedback = `Unknown background "${value}". Valid: Acolyte, Soldier, Sage, Criminal, Guide, Merchant.`;
            isError = true;
          } else {
            cgState.background = value;
            cgState.abilityIncreases = { ...bgMeta.fixedIncreases };
            feedback = `Background set to ${value}. Ability increases auto-applied.`;
          }
        } else {
          feedback = "In Stage 2, you can only set: species, background.";
          isError = true;
        }
      } else if (cgState.stage === 3) {
        const ab = DND_ABILITIES.find(a => a === key || a.slice(0, 3) === key);
        if (ab) {
          const val = parseInt(value, 10);
          if (isNaN(val) || val < 8 || val > 15) {
            feedback = "Base ability scores must be integers between 8 and 15.";
            isError = true;
          } else {
            cgState.abilities[ab] = val;
            let totalCost = 0;
            for (const a of DND_ABILITIES) {
              totalCost += POINT_BUY_COSTS[cgState.abilities[a]] ?? 0;
            }
            feedback = `${ab.charAt(0).toUpperCase() + ab.slice(1)} set to ${val}. You have ${27 - totalCost} points left.`;
          }
        } else {
          feedback = "In Stage 3, you can only set base ability scores (e.g. Strength, Dexterity).";
          isError = true;
        }
      } else if (cgState.stage === 4) {
        if (key === "skill") {
          const skName = value.toLowerCase().replace(/\s+/g, "_");
          const clsMeta = CLASS_METADATA[cgState.class.toLowerCase()];
          if (!clsMeta) {
            feedback = "Choose a class first.";
            isError = true;
          } else {
            const sk = DND_SKILLS.find(s => s === skName || s.replace(/_/g, "") === skName.replace(/_/g, ""));
            if (!sk) {
              feedback = `Unknown skill "${value}".`;
              isError = true;
            } else if (!clsMeta.skillOptions.includes(sk)) {
              feedback = `Skill "${value}" is not on the skill options list for a ${cgState.class}.`;
              isError = true;
            } else {
              const bgMeta = BACKGROUND_METADATA[cgState.background.toLowerCase()];
              if (bgMeta?.skills.includes(sk)) {
                feedback = `Background ${cgState.background} already grants proficiency in "${value}". Choose another.`;
                isError = true;
              } else {
                if (cgState.chosenSkills.includes(sk)) {
                  cgState.chosenSkills = cgState.chosenSkills.filter(s => s !== sk);
                  feedback = `Removed skill proficiency: ${value}.`;
                } else {
                  if (cgState.chosenSkills.length >= clsMeta.skillCount) {
                    feedback = `You have already selected the maximum of ${clsMeta.skillCount} skills.`;
                    isError = true;
                  } else {
                    cgState.chosenSkills.push(sk);
                    feedback = `Added skill proficiency: ${value}.`;
                  }
                }
              }
            }
          }
        } else {
          feedback = "In Stage 4, you can only set: skill.";
          isError = true;
        }
      } else if (cgState.stage === 5) {
        if (key === "feat") {
          const cleanVal = value.toLowerCase().trim().replace(/\s+/g, "_");
          const isFeatOpt = ORIGIN_FEATS.includes(cleanVal);
          if (!isFeatOpt) {
            feedback = `Feat "${value}" is not a valid origin feat. Options: Alert, Crafter, Healer, Lucky, Magic Initiate Cleric, Magic Initiate Druid, Magic Initiate Wizard, Musician, Savage Attacker, Skilled, Tough.`;
            isError = true;
          } else {
            const maxFeats = cgState.species.toLowerCase() === "human" ? 2 : 1;
            const idx = cgState.chosenFeats.indexOf(cleanVal);
            if (idx >= 0) {
              cgState.chosenFeats.splice(idx, 1);
              feedback = `Removed feat: ${value}.`;
            } else {
              if (cgState.chosenFeats.length >= maxFeats) {
                feedback = `You have already selected the maximum of ${maxFeats} feats.`;
                isError = true;
              } else {
                cgState.chosenFeats.push(cleanVal);
                feedback = `Added feat: ${value}.`;
              }
            }
          }
        } else {
          feedback = "In Stage 5, you can only set: feat.";
          isError = true;
        }
      } else if (cgState.stage === 6 && isCaster) {
        if (key === "spell") {
          const clsMeta = CLASS_METADATA[cgState.class.toLowerCase()];
          const spellcasting = clsMeta?.spellcasting;
          if (!spellcasting) {
            feedback = "Choose a spellcaster class first.";
            isError = true;
          } else {
            const cleanVal = value.toLowerCase().trim().replace(/\s+/g, "_");
            const isCantripOpt = spellcasting.cantripOptions.includes(cleanVal);
            const isSpellOpt = spellcasting.spellOptions.includes(cleanVal);

            if (!isCantripOpt && !isSpellOpt) {
              feedback = `Spell "${value}" is not on the spell/cantrip options list for a ${cgState.class}.`;
              isError = true;
            } else if (isCantripOpt) {
              const idx = cgState.chosenSpells.indexOf(cleanVal);
              if (idx >= 0) {
                cgState.chosenSpells.splice(idx, 1);
                feedback = `Removed cantrip: ${value}.`;
              } else {
                const currentCantrips = cgState.chosenSpells.filter(s => spellcasting.cantripOptions.includes(s)).length;
                if (currentCantrips >= spellcasting.cantripCount) {
                  feedback = `You have already selected the maximum of ${spellcasting.cantripCount} cantrips.`;
                  isError = true;
                } else {
                  cgState.chosenSpells.push(cleanVal);
                  feedback = `Added cantrip: ${value}.`;
                }
              }
            } else if (isSpellOpt) {
              const idx = cgState.chosenSpells.indexOf(cleanVal);
              if (idx >= 0) {
                cgState.chosenSpells.splice(idx, 1);
                feedback = `Removed spell: ${value}.`;
              } else {
                const currentSpells = cgState.chosenSpells.filter(s => spellcasting.spellOptions.includes(s)).length;
                if (currentSpells >= spellcasting.spellCount) {
                  feedback = `You have already selected the maximum of ${spellcasting.spellCount} spells.`;
                  isError = true;
                } else {
                  cgState.chosenSpells.push(cleanVal);
                  feedback = `Added spell: ${value}.`;
                }
              }
            }
          }
        } else {
          feedback = "In Stage 6, you can only set: spell.";
          isError = true;
        }
      } else if (cgState.stage === gearStage) {
        const clsMeta = CLASS_METADATA[cgState.class.toLowerCase()];
        const gearChoiceMatch = key.match(/^gear(\d+)$/);

        if (key === "gear") {
          const valLower = value.toLowerCase().trim();
          if (valLower !== "equipment" && valLower !== "gold") {
            feedback = `Invalid gear option "${value}". Valid choices: equipment, gold.`;
            isError = true;
          } else {
            cgState.startingGear = valLower as "equipment" | "gold";
            const len = clsMeta?.startingEquipmentChoices?.length ?? 0;
            cgState.chosenGearOptions = Array(len).fill(0);
            feedback = `Starting gear option set to ${valLower}.`;
          }
        } else if (gearChoiceMatch && cgState.startingGear === "equipment") {
          const choiceIndex = parseInt(gearChoiceMatch[1], 10) - 1;
          const optionIndex = parseInt(value, 10) - 1;
          const choice = clsMeta?.startingEquipmentChoices?.[choiceIndex];

          if (!choice) {
            feedback = `Invalid choice index: gear${choiceIndex + 1}.`;
            isError = true;
          } else {
            const option = choice.options[optionIndex];
            if (!option) {
              feedback = `Invalid option "${value}" for Choice ${choiceIndex + 1}.`;
              isError = true;
            } else {
              if (!cgState.chosenGearOptions) {
                cgState.chosenGearOptions = [];
              }
              cgState.chosenGearOptions[choiceIndex] = optionIndex;
              feedback = `Set choice ${choiceIndex + 1} to option ${optionIndex + 1}: ${option.label}.`;
            }
          }
        } else {
          feedback =
            "Set starting gear type using 'gear=equipment|gold'. " +
            "Set package options using 'gear1=1', 'gear2=2' etc.";
          isError = true;
        }
      }
    }

    if (!isError) {
      await u.db.modify(target.id, "$set", { "data.dnd_cg": cgState });
    }
    const finalFeedback = isError ? `%crError: ${feedback}%cn` : `%cg${feedback}%cn`;
    u.send(finalFeedback);
    return;
  }

  if (sw === "back") {
    if (cgState.stage > 1) {
      cgState.stage -= 1;
      await u.db.modify(target.id, "$set", { "data.dnd_cg": cgState });
      u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%cgMoved back one stage.%cn"));
    } else {
      u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%crError: You are already at the first stage.%cn"));
    }
    return;
  }

  if (sw === "next") {
    if (cgState.stage === 1) {
      if (!cgState.class) {
        u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%crError: You must choose a Class to proceed.%cn"));
        return;
      }
      cgState.stage = 2;
    } else if (cgState.stage === 2) {
      if (!cgState.species || !cgState.background) {
        u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%crError: You must choose both Species and Background to proceed.%cn"));
        return;
      }
      cgState.stage = 3;
    } else if (cgState.stage === 3) {
      const valResult = validateAbilityScores(cgState.abilities);
      if (!valResult.valid) {
        u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, `%crError: ${valResult.error}%cn`));
        return;
      }
      cgState.stage = 4;
    } else if (cgState.stage === 4) {
      const clsMeta = CLASS_METADATA[cgState.class.toLowerCase()];
      if (cgState.chosenSkills.length < (clsMeta?.skillCount ?? 0)) {
        u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, `%crError: You must choose exactly ${clsMeta?.skillCount} skills (selected: ${cgState.chosenSkills.length}).%cn`));
        return;
      }
      cgState.stage = 5;
    } else if (cgState.stage === 5) {
      const bgMeta = BACKGROUND_METADATA[cgState.background.toLowerCase()];
      if (cgState.chosenFeats.length === 0 && bgMeta?.feat) {
        cgState.chosenFeats.push(bgMeta.feat.toLowerCase().trim().replace(/\s+/g, "_"));
      }
      const maxFeats = cgState.species.toLowerCase() === "human" ? 2 : 1;
      if (cgState.chosenFeats.length < maxFeats) {
        u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, `%crError: You must choose exactly ${maxFeats} feats (selected: ${cgState.chosenFeats.length}).%cn`));
        return;
      }
      cgState.stage = 6;
    } else if (cgState.stage === 6) {
      if (isCaster) {
        const clsMeta = CLASS_METADATA[cgState.class.toLowerCase()];
        const spellcasting = clsMeta?.spellcasting;
        if (spellcasting) {
          const currentCantrips = cgState.chosenSpells.filter(s => spellcasting.cantripOptions.includes(s)).length;
          const currentSpells = cgState.chosenSpells.filter(s => spellcasting.spellOptions.includes(s)).length;
          if (currentCantrips < spellcasting.cantripCount || currentSpells < spellcasting.spellCount) {
            u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, `%crError: You must choose exactly ${spellcasting.cantripCount} cantrips and ${spellcasting.spellCount} spells (selected: ${currentCantrips} cantrips, ${currentSpells} spells).%cn`));
            return;
          }
        }
        cgState.stage = 7;
      } else {
        cgState.stage = gearStage;
      }
    } else if (cgState.stage === gearStage) {
      if (!cgState.startingGear) {
        u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%crError: You must choose a starting gear option to proceed.%cn"));
        return;
      }
      if (cgState.startingGear === "equipment") {
        const clsMeta = CLASS_METADATA[cgState.class.toLowerCase()];
        const len = clsMeta?.startingEquipmentChoices?.length ?? 0;
        for (let i = 0; i < len; i++) {
          if (cgState.chosenGearOptions?.[i] === undefined) {
            u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, `%crError: You must select an option for Choice ${i + 1} before proceeding.%cn`));
            return;
          }
        }
      }
      cgState.stage = reviewStage;
    } else {
      u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "Type %ch+cg/submit%cn to finalize your character sheet."));
      return;
    }

    await u.db.modify(target.id, "$set", { "data.dnd_cg": cgState });
    u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%cgAdvanced to the next stage.%cn"));
    return;
  }

  if (sw === "submit") {
    if (cgState.stage !== reviewStage) {
      u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState, "%crError: You must complete all steps before submitting.%cn"));
      return;
    }

    const bgMeta = BACKGROUND_METADATA[cgState.background.toLowerCase()];
    const clsMeta = CLASS_METADATA[cgState.class.toLowerCase()];

    const finalAbilities = {} as Record<DndAbility, number>;
    for (const ab of DND_ABILITIES) {
      finalAbilities[ab] = cgState.abilities[ab] + cgState.abilityIncreases[ab];
    }

    const conMod = getAbilityMod(finalAbilities.constitution);
    const hitDie = clsMeta?.hitDie ?? 8;
    const hpMax = hitDie + conMod;

    const skillProficiency = {} as Record<DndSkill, "none" | "proficient" | "expert">;
    for (const skill of DND_SKILLS) {
      skillProficiency[skill] = "none";
    }

    if (bgMeta) {
      for (const sk of bgMeta.skills) {
        skillProficiency[sk] = "proficient";
      }
    }
    for (const sk of cgState.chosenSkills) {
      skillProficiency[sk] = "proficient";
    }

    if (cgState.species.toLowerCase() === "elf") {
      skillProficiency.perception = "proficient";
    }
    if (cgState.species.toLowerCase() === "human") {
      const freeSkill = clsMeta?.skillOptions.find(s => skillProficiency[s] === "none");
      if (freeSkill) {
        skillProficiency[freeSkill] = "proficient";
      }
    }

    const feats: string[] = [];
    if (cgState.chosenFeats.length > 0) {
      for (const f of cgState.chosenFeats) {
        feats.push(f.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
      }
    } else if (bgMeta?.feat) {
      feats.push(bgMeta.feat);
    }

    const spells = [...cgState.chosenSpells];
    const spellSlotsMax: Record<number, number> = {};
    const spellSlotsCurrent: Record<number, number> = {};
    for (let i = 1; i <= 9; i++) {
      spellSlotsMax[i] = 0;
      spellSlotsCurrent[i] = 0;
    }
    if (clsMeta?.spellcasting) {
      const slots = cgState.class.toLowerCase() === "warlock" ? 1 : 2;
      spellSlotsMax[1] = slots;
      spellSlotsCurrent[1] = slots;
    }

    const sheet = migrateSheet({
      class: cgState.class,
      species: cgState.species,
      background: cgState.background,
      abilities: finalAbilities,
      skillProficiency,
      savingThrowProficiency: clsMeta?.saves || [],
      hp: {
        max: hpMax,
        current: hpMax,
        temp: 0
      },
      ac: 10 + getAbilityMod(finalAbilities.dexterity),
      feats,
      spells,
      spellSlotsMax,
      spellSlotsCurrent,
      gold: cgState.startingGear === "gold" ? (clsMeta?.startingGold ?? 100) : 10
    });

    await u.db.modify(target.id, "$set", { "data.dnd": sheet });
    await u.db.modify(target.id, "$unset", { "data.dnd_cg": "" });

    // Spawn starting equipment items if chosen
    if (cgState.startingGear !== "gold" && clsMeta?.startingEquipmentChoices) {
      const chosenItems: Array<{ name: string; spec: string }> = [];
      clsMeta.startingEquipmentChoices.forEach((choice, choiceIdx) => {
        const optIdx = cgState.chosenGearOptions?.[choiceIdx] ?? 0;
        const opt = choice.options[optIdx];
        if (opt) {
          chosenItems.push(...opt.items);
        }
      });

      for (const eq of chosenItems) {
        const parts = eq.spec.split(":");
        const type = parts[0].toLowerCase();
        const dndData: Record<string, any> = {
          type,
          equipped: true
        };

        if (type === "weapon") {
          dndData.damage = parts[1] || "1d6";
          dndData.damageType = parts[2] || "slashing";
          dndData.properties = parts.slice(3).map(p => p.toLowerCase());
          dndData.weaponType = dndData.properties.includes("ranged") ? "ranged" : "melee";
        } else if (type === "armor") {
          dndData.ac = parseInt(parts[1] || "11", 10);
          dndData.armorType = (parts[2] || "light").toLowerCase();
        } else if (type === "shield") {
          dndData.ac = parseInt(parts[1] || "2", 10);
          dndData.armorType = "shield";
        }

        await u.db.create({
          flags: new Set(["thing"]),
          location: target.id,
          name: eq.name,
          state: {
            name: eq.name,
            dnd: dndData,
            owner: target.id
          }
        });
      }

      await recalculateAndSaveAC(u, target);
    }

    u.send("%ch%cgCG>>%cn Character generation complete! Your sheet has been approved and saved. Type %ch+sheet%cn to view it.");
    return;
  }


  // Default output
  u.send(getStageInstructions(u, u.util.displayName(target, u.me), cgState));
}

addCmd({
  name: "+cg",
  pattern: /^\+cg(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+cg [<switch>] [<args>]  -- Guided character creation.

Switches:
  /reset        -- Start over with a clean chargen wizard.
  /set <k>=<v>  -- Set chargen fields (class, species, background, ability scores).
  /back         -- Return to previous stage.
  /next         -- Advance to next stage.
  /submit       -- Submit and finalize your approved sheet.

Examples:
  +cg
  +cg/set class=Wizard
  +cg/next
  +cg/set intelligence=15
  +cg/submit`,
  exec: dndCgExec
});

export function getXpRequired(level: number): number {
  if (level <= 1) return 0;
  if (level > 20) return Infinity;
  const thresholds = [
    0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000,
    64000, 85000, 100000, 120000, 140000, 165000, 195000,
    225000, 265000, 305000, 355000
  ];
  return thresholds[level] || Infinity;
}

export function calculateSpellSlots(
  classes: Record<string, number>
): Record<number, number> {
  const slots: Record<number, number> = {};
  for (let i = 1; i <= 9; i++) {
    slots[i] = 0;
  }

  let fullLevels = 0;
  let halfLevels = 0;
  let warlockLevel = 0;

  for (const [clsName, lvl] of Object.entries(classes)) {
    const cls = clsName.toLowerCase();
    if (["wizard", "cleric", "druid", "bard", "sorcerer"].includes(cls)) {
      fullLevels += lvl;
    } else if (["paladin", "ranger"].includes(cls)) {
      halfLevels += lvl;
    } else if (cls === "warlock") {
      warlockLevel += lvl;
    }
  }

  const casterLevel = fullLevels + Math.floor(halfLevels / 2);

  if (casterLevel > 0) {
    const table: Record<number, number[]> = {
      1: [2],
      2: [3],
      3: [4, 2],
      4: [4, 3],
      5: [4, 3, 2],
      6: [4, 3, 3],
      7: [4, 3, 3, 1],
      8: [4, 3, 3, 2],
      9: [4, 3, 3, 3, 1],
      10: [4, 3, 3, 3, 2],
      11: [4, 3, 3, 3, 2, 1],
      12: [4, 3, 3, 3, 2, 1],
      13: [4, 3, 3, 3, 2, 1, 1],
      14: [4, 3, 3, 3, 2, 1, 1],
      15: [4, 3, 3, 3, 2, 1, 1, 1],
      16: [4, 3, 3, 3, 2, 1, 1, 1],
      17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
      18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
      19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
      20: [4, 3, 3, 3, 3, 2, 2, 1, 1]
    };
    const levelClamped = Math.min(20, casterLevel);
    const row = table[levelClamped] || [];
    for (let i = 0; i < row.length; i++) {
      slots[i + 1] = row[i];
    }
  }

  if (warlockLevel > 0) {
    let slotLvl = 1;
    let numSlots = 2;
    if (warlockLevel === 1) {
      slotLvl = 1;
      numSlots = 1;
    } else if (warlockLevel === 2) {
      slotLvl = 1;
      numSlots = 2;
    } else if (warlockLevel <= 4) {
      slotLvl = 2;
    } else if (warlockLevel <= 6) {
      slotLvl = 3;
    } else if (warlockLevel <= 8) {
      slotLvl = 4;
    } else {
      slotLvl = 5;
      if (warlockLevel >= 11) numSlots = 3;
      if (warlockLevel >= 17) numSlots = 4;
    }
    slots[slotLvl] = (slots[slotLvl] || 0) + numSlots;
  }

  return slots;
}

addCmd({
  name: "+level",
  pattern: /^\+level(?:\s+(.*))?/i,
  lock: "connected",
  category: "Dnd",
  help: `+level [<class>]  -- Level up your character class.

Usage:
  +level
  +level wizard`,
  exec: async (u: IUrsamuSDK) => {
    const target = u.me;
    if (!target.state?.dnd) {
      u.send("You do not have a character sheet yet.");
      return;
    }

    const sheet = migrateSheet(target.state.dnd);
    let classArg = (u.cmd.args[0] || "").trim().toLowerCase();

    if (!classArg) {
      const classesList = Object.keys(sheet.classes);
      if (classesList.length === 0) {
        classArg = sheet.class.toLowerCase();
      } else {
        classArg = classesList[0].toLowerCase();
      }
    }

    const canonicalClass = Object.keys(CLASS_METADATA).find(
      (k) => k.toLowerCase() === classArg
    );
    if (!canonicalClass) {
      u.send(`Error: Unknown class: "${classArg}".`);
      return;
    }

    const currentTotalLevel = Object.values(sheet.classes).reduce(
      (a, b) => a + b,
      0
    );

    const nextLevel = currentTotalLevel + 1;
    const xpRequired = getXpRequired(nextLevel);
    if ((sheet.xp || 0) < xpRequired) {
      u.send(
        `You do not have enough XP to level up. ` +
          `Required: ${xpRequired} XP, Current: ${sheet.xp || 0} XP.`
      );
      return;
    }

    const classProperName =
      canonicalClass.charAt(0).toUpperCase() + canonicalClass.slice(1);
    sheet.classes[classProperName] =
      (sheet.classes[classProperName] || 0) + 1;
    sheet.level = nextLevel;
    sheet.hitDice.max = nextLevel;
    sheet.hitDice.current = Math.min(nextLevel, sheet.hitDice.current + 1);

    const classParts = Object.entries(sheet.classes).map(
      ([cls, lvl]) => `${cls} ${lvl}`
    );
    if (classParts.length === 1) {
      sheet.class = Object.keys(sheet.classes)[0];
    } else {
      sheet.class = classParts.join(" / ");
    }

    const hitDie = CLASS_METADATA[canonicalClass].hitDie;
    const avgRoll = Math.floor(hitDie / 2) + 1;
    const conMod = getAbilityMod(sheet.abilities.constitution || 10);
    const hpIncrease = Math.max(1, avgRoll + conMod);
    sheet.hp.max += hpIncrease;
    sheet.hp.current += hpIncrease;

    const newSlots = calculateSpellSlots(sheet.classes);
    for (let i = 1; i <= 9; i++) {
      sheet.spellSlotsMax[i] = newSlots[i] || 0;
      sheet.spellSlotsCurrent[i] = newSlots[i] || 0;
    }

    await u.db.modify(target.id, "$set", { "data.dnd": sheet });
    u.send(
      `%ch%cgCG>>%cn You leveled up! You are now a Level ${nextLevel} ` +
        `character: ${sheet.class} (Max HP increased to ${sheet.hp.max}).`
    );
  }
});
