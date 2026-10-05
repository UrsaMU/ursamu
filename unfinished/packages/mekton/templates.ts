export interface IRookieTemplate {
  name: string;
  skillBonuses: Record<string, number>;
  equipment: string[];
  bonusCash: number;
}

export const ROOKIE_TEMPLATES: IRookieTemplate[] = [
  {
    name: "Anime Hero",
    skillBonuses: {
      "Mecha Piloting": 1,
      "Mecha Gunnery": 1,
      "Mecha Melee": 1,
      "Wardrobe & Style": 1,
      "Blade": 1,
      "Driving": 1,
      "Stealth": 1,
    },
    equipment: ["pilot suit", "motorcycle", "sword", "handgun"],
    bonusCash: 300,
  },
  {
    name: "Girlfriend/Boyfriend",
    skillBonuses: {
      "Seduction": 2,
      "Interrogation": 1,
      "Human Perception": 2,
      "Driving": 1,
      "Shadowing/Avoid Pursuit": 1,
    },
    equipment: ["prized possession", "racy clothing"],
    bonusCash: 400,
  },
  {
    name: "Anime Babe",
    skillBonuses: {
      "Wardrobe & Style": 2,
      "Personal Grooming": 2,
      "Social": 1,
      "Seduction": 1,
      "Handgun": 1,
    },
    equipment: ["dress", "small handgun", "makeup kit"],
    bonusCash: 150,
  },
  {
    name: "Anime Stud",
    skillBonuses: {
      "Driving": 1,
      "Intimidate": 1,
      "Blade": 1,
      "Handgun": 1,
      "Interrogation": 1,
      "Streetwise": 1,
      "Dodge & Escape": 1,
    },
    equipment: ["sword", "handgun", "motorcycle", "sunglasses"],
    bonusCash: 100,
  },
  {
    name: "The Big Lug",
    skillBonuses: {
      "Intimidate": 2,
      "Interrogation": 1,
      "Hand to Hand": 2,
      "Mecha Tech": 1,
      "Dodge & Escape": 1,
    },
    equipment: ["heavy vehicle", "music player", "toolkit"],
    bonusCash: 200,
  },
  {
    name: "The Kid",
    skillBonuses: {
      "Dodge & Escape": 3,
      "Handgun": 1,
      "Streetwise": 1,
      "Athletics": 1,
      "Stealth": 1,
    },
    equipment: ["photo of hero", "memento", "pet"],
    bonusCash: 100,
  },
  {
    name: "Celebrity",
    skillBonuses: {
      "Leadership": 2,
      "Personal Grooming": 1,
      "Wardrobe & Style": 1,
      "Acting": 3,
    },
    equipment: ["holo-cam", "recordings", "minidisk", "flashy clothing"],
    bonusCash: 400,
  },
];

export function findTemplate(name: string): IRookieTemplate | undefined {
  return ROOKIE_TEMPLATES.find(
    (t) => t.name.toLowerCase() === name.toLowerCase(),
  );
}
