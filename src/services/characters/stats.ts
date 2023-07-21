import { flags } from "../flags";

interface IMStat {
  name: string;
  values: any[];
  type: string;
  splat?: string;
  flags?: string;
  lock?: string;
  data?: any;
}

interface IMStatEntry {
  name: string;
  value: any;
  temp?: any;
  splat?: string;
}

interface character {
  name: string;
  attributes: IMStatEntry[];
  skills: IMStatEntry[];
  bio: IMStatEntry[];
}

// add splat flags
flags.add(
  {
    name: "mortal",
    code: "[m]",
    lock: "builder+",
  },
  {
    name: "ghoul",
    code: "[g]",
    lock: "builder+",
  },
  {
    name: "vampire",
    code: "[v]",
    lock: "builder+",
  },
  {
    name: "werewolf",
    code: "[w]",
    lock: "builder+",
  },
  {
    name: "kinfolk",
    code: "[k]",
    lock: "builder+",
  }
);

export const attributes: IMStat[] = [
  {
    name: "strength",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "dexterity",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "stamina",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "charisma",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "manipulation",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "composure",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "intelligence",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "wits",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
  {
    name: "resolve",
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    type: "attribute",
  },
];

export const skills: IMStat[] = [
  {
    name: "athletics",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "brawl",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "craft",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "driving",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "firearms",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "larceny",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "melee",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "stealth",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "survival",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "animal ken",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "etiquette",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "insight",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "intimidation",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "leadership",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "performance",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "persuasion",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "streetwise",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "subterfuge",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "academics",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "awareness",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "finance",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "investigation",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "medicine",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "occult",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "politics",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "science",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
  {
    name: "technology",
    values: [0, 1, 2, 3, 4, 5],
    type: "skill",
  },
];

export const allStats = [...attributes, ...skills];
