/**
 * Shared chargen constants (methods, stages, presets).
 */
import type {
  ChargenMethod,
  ChargenStage,
  Role,
  StatKey,
} from "../db/schemas.ts";
import { CYBERWARE_CATALOG } from "../data/cyberware.ts";

export const STAGE_ORDER: ChargenStage[] = [
  "method",
  "role_select",
  "lifepath_cultural",
  "lifepath_personality",
  "lifepath_motivations",
  "lifepath_family",
  "lifepath_friends",
  "lifepath_enemies",
  "lifepath_events",
  "lifepath_role",
  "stats",
  "skills",
  "lifestyle",
  "cyberware",
  "equipment",
  "review",
  "complete",
];

export const METHODS: ChargenMethod[] = [
  "streetrat",
  "edgerunner",
  "complete",
];

/**
 * Starting eurodollars by method (CPR core).
 * Streetrat / Edgerunner: free Role kit + 500eb pocket money.
 * Complete: 2,550eb to buy weapons/armor/gear/cyberware
 * (plus 800eb fashion-only — tracked separately if needed).
 */
export const STARTING_EB: Record<ChargenMethod, number> = {
  streetrat: 500,
  edgerunner: 500,
  complete: 2550,
};

/** Complete Package fashion / fashionware-only budget (unused remainder lost). */
export const STARTING_FASHION_EB = 800;

export const STAT_KEYS: StatKey[] = [
  "int", "ref", "dex", "tech", "cool",
  "will", "luck", "move", "body", "emp",
];

export const LIFEPATH_STAGES = new Set<ChargenStage>([
  "lifepath_cultural",
  "lifepath_personality",
  "lifepath_motivations",
  "lifepath_family",
  "lifepath_friends",
  "lifepath_enemies",
  "lifepath_events",
  "lifepath_role",
]);

/** Friendly aliases → canonical stage */
export const STAGE_ALIAS: Record<string, ChargenStage> = {
  cultural: "lifepath_cultural",
  origin: "lifepath_cultural",
  personality: "lifepath_personality",
  appearance: "lifepath_personality",
  look: "lifepath_personality",
  motivations: "lifepath_motivations",
  goals: "lifepath_motivations",
  values: "lifepath_motivations",
  family: "lifepath_family",
  background: "lifepath_family",
  friends: "lifepath_friends",
  allies: "lifepath_friends",
  enemies: "lifepath_enemies",
  foes: "lifepath_enemies",
  events: "lifepath_events",
  history: "lifepath_events",
  role: "lifepath_role",
  defining: "lifepath_role",
};

/**
 * Edgerunner / Streetrat Role skill packages (CPR core ~p.88–89).
 * Each Role has 20 skills. 86 points = sum(rank × cost) across
 * this list (min 2 / max 6 per skill in chargen).
 */
export const CAREER_SKILLS: Record<Role, string[]> = {
  // Shared "basic 13" appear on every Role package first.
  rockerboy: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "composition", "handgun", "melee_weapon",
    "personal_grooming", "play_instrument", "streetwise",
    "wardrobe_style",
  ],
  solo: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "autofire", "handgun", "interrogation", "melee_weapon",
    "resist_torture_drugs", "shoulder_arms", "tactics",
  ],
  netrunner: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "basic_tech", "conceal_reveal_object", "cryptography",
    "cybertech", "electronics_security_tech", "handgun",
    "library_search",
  ],
  tech: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "basic_tech", "cybertech", "electronics_security_tech",
    "land_vehicle_tech", "shoulder_arms", "science",
    "weaponstech",
  ],
  medtech: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "basic_tech", "cybertech", "deduction",
    "paramedic", "resist_torture_drugs", "science",
    "shoulder_arms",
  ],
  media: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "bribery", "composition", "deduction", "handgun",
    "library_search", "lip_reading", "photography_film",
  ],
  lawman: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "autofire", "criminology", "deduction", "handgun",
    "interrogation", "shoulder_arms", "tracking",
  ],
  exec: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "accounting", "bureaucracy", "business", "deduction",
    "handgun", "lip_reading", "personal_grooming",
  ],
  fixer: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "bribery", "business", "forgery", "handgun",
    "pick_lock", "streetwise", "trading",
  ],
  nomad: [
    "athletics", "brawling", "concentration", "conversation",
    "education", "evasion", "first_aid", "human_perception",
    "language_streetslang", "local_expert", "perception",
    "persuasion", "stealth",
    "animal_handling", "drive_land_vehicle", "handgun",
    "melee_weapon", "tracking", "trading",
    "wilderness_survival",
  ],
};

export const ROLE_WEAPON_SKILLS: Record<Role, string[]> = {
  rockerboy: ["handgun", "melee_weapon"],
  solo: ["handgun", "shoulder_arms", "melee_weapon"],
  netrunner: ["handgun"],
  medtech: ["handgun"],
  tech: ["handgun"],
  media: ["handgun"],
  exec: ["handgun", "melee_weapon"],
  lawman: ["handgun", "shoulder_arms"],
  fixer: ["handgun", "melee_weapon"],
  nomad: ["handgun", "shoulder_arms"],
};

export const STARTER_CHROME = CYBERWARE_CATALOG.filter((c) =>
  ["fashionware", "neuralware", "cyberoptics", "cyberaudio"]
    .includes(c.category) && c.hl <= 7
);

export const LIFEPATH_FIELD_MAP: Record<string, string> = {
  cultural_origin: "culturalOrigin",
  language: "language",
  personality: "personality",
  clothing_style: "clothingStyle",
  hairstyle: "hairstyle",
  affectation: "affectation",
  life_goal: "lifeGoal",
  most_valued_person: "mostValuablePerson",
  most_valued_thing: "mostValuableThing",
  feeling_about_people: "feelingAboutPeople",
  family_background: "familyBackground",
  childhood_environment: "childhoodEnvironment",
  family_crisis: "familyCrisis",
  friend_name: "friendName",
  friend_how: "friendHow",
};

export function nextStage(current: ChargenStage): ChargenStage {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 2) return "review";
  return STAGE_ORDER[idx + 1]!;
}

export function prevStage(current: ChargenStage): ChargenStage {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx <= 0) return "method";
  return STAGE_ORDER[idx - 1]!;
}

export function d10(): number {
  return Math.ceil(Math.random() * 10);
}

export function dN(n: number): number {
  return Math.ceil(Math.random() * n);
}
