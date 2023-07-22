import { IDBOBJ } from "../../@types";

export interface IMStat {
  name: string;
  values: any[];
  type: string;
  splat?: string;
  lock?: string;
  category?: string;
  default?: any;
  data?: any;
  hasInstance?: boolean;
  instances?: string[];
  hasSpecialties?: boolean;
  specialties?: IMStat[];
  check?: (obj?: IDBOBJ) => boolean;
}

export interface IMStatEntry {
  name: string;
  value: any;
  temp?: any;
  type?: string;
  category?: string;
}

export const bio: IMStat[] = [
  {
    name: "full name",
    values: [],
    type: "bio",
  },
  {
    name: "concept",
    values: [],
    type: "bio",
  },
  {
    name: "Birth Date",
    values: [],
    type: "bio",
  },

  {
    name: "splat",
    values: ["vampire", "mortal", "ghoul"],
    type: "bio",
    lock: "builder+",
  },
  {
    name: "auspice",
    values: ["ahroun, galliard, philodox, theurge, ragabash"],
    type: "bio",
    category: "werewolf",
  },
  {
    name: "tribe",
    values: [
      "black furies",
      "bone gnawers",
      "children of gaia",
      "fianna",
      "glass walkers",
      "red talons",
      "shadow lords",
      "silent striders",
      "silver fangs",
      "stargazers",
      "ghost council",
    ],
    type: "bio",
    category: "werewolf",
  },
  {
    name: "ambition",
    values: [],
    type: "bio",
  },
  {
    name: "desire",
    values: [],
    type: "bio",
  },
  {
    name: "Predator",
    values: [],
    type: "bio",
    category: "vampire",
  },
  {
    name: "clan",
    values: [],
    type: "bio",
    category: "vampire",
  },
  {
    name: "generation",
    values: [],
    type: "bio",
    category: "vampire",
  },
];

export const attributes: IMStat[] = [
  {
    name: "strength",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "physical",
  },
  {
    name: "dexterity",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "physical",
  },
  {
    name: "stamina",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "physical",
  },
  {
    name: "charisma",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "social",
  },
  {
    name: "manipulation",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "social",
  },
  {
    name: "composure",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "social",
  },
  {
    name: "intelligence",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "mental",
  },
  {
    name: "wits",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "mental",
  },
  {
    name: "resolve",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
    default: 1,
    category: "mental",
  },
];

export const skills: IMStat[] = [
  {
    name: "athletics",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "brawl",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "craft",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "driving",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "firearms",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "larceny",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "melee",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "stealth",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "survival",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "physical",
  },
  {
    name: "animal ken",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "etiquette",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "insight",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "intimidation",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "leadership",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "performance",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "persuasion",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "streetwise",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "subterfuge",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "social",
  },
  {
    name: "academics",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "awareness",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "finance",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "investigation",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "medicine",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "occult",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "politics",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "science",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
  {
    name: "technology",
    values: [0, 1, 2, 3, 4, 5],
    hasSpecialties: true,
    type: "skill",
    default: 0,
    category: "mental",
  },
];

const merits: IMStat[] = [
  {
    name: "linguistics",
    values: [1, 2, 3, 4, 5],
    type: "merit",
  },
  {
    name: "beautifull",
    values: [2],
    type: "merit",
  },
  {
    name: "stunning",
    values: [4],
    type: "merit",
  },
  {
    name: "bond resistance",
    values: [1],
    type: "merit",
    category: "vampire",
  },
  {
    name: "short bond",
    values: [2],
    type: "merit",
    category: "vampire",
  },
  {
    name: "unbondable",
    values: [5],
    type: "merit",
    category: "vampire",
  },
  {
    name: "bloodhound",
    values: [1],
    type: "merit",
    category: "vampire",
  },
  {
    name: "iron gullet",
    values: [3],
    type: "merit",
    category: "vampire",
  },
  {
    name: "eat food",
    values: [2],
    type: "merit",
    category: "vampire",
  },
  {
    name: "high-functioning addict",
    values: [1],
    type: "merit",
    category: "vampire",
  },
];

const flaws: IMStat[] = [
  {
    name: "illiterate",
    values: [2],
    type: "flaw",
  },
  {
    name: "repulsive",
    values: [2],
    type: "flaw",
  },
  {
    name: "ugly",
    values: [1],
    type: "flaw",
  },
  {
    name: "hopeless addiction",
    values: [2],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "addiction",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "archaic",
    values: [2],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "living in the past",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "bondslave",
    values: [2],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "bond junkie",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "long bond",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "famer",
    values: [2],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "organovore",
    values: [2],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "methuselah's thirst",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "prey exclusion",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "stake bait",
    values: [2],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "folkoric bane",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "folkloric block",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
  {
    name: "stigmata",
    values: [1],
    type: "flaw",
    category: "vampire",
  },
];

export const allStats = [...bio, ...attributes, ...skills, ...merits, ...flaws];
