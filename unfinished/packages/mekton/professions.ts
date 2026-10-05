export interface IProfession {
  name: string;
  dangerous: boolean;
  skills: string[]; // exactly 7; player chooses 5
}

export const PROFESSIONS: IProfession[] = [
  { name: "Actor/Actress",     dangerous: false, skills: ["Acting", "Persuasion & Fast Talk", "Compose or Write", "Wardrobe & Style", "Social", "Personal Grooming", "Interview"] },
  { name: "Artist",            dangerous: false, skills: ["Streetwise", "Compose or Write", "Paint or Draw", "Wardrobe & Style", "Expert: Art History", "Social", "Photography & Film"] },
  { name: "Athlete",           dangerous: false, skills: ["Survival", "Hand to Hand", "Blade", "Expert: Nutrition", "Athletics", "Swimming", "Dance"] },
  { name: "Computer Geek",     dangerous: false, skills: ["Jury Rig", "Persuasion & Fast Talk", "Basic Repair", "Expert: Hacking", "Programming", "Awareness/Notice", "Teaching"] },
  { name: "Cop",               dangerous: true,  skills: ["Driving", "Handgun", "Streetwise", "Dodge & Escape", "Intimidate", "Automatic Weapon", "Interrogation"] },
  { name: "Criminal",          dangerous: true,  skills: ["Pick Lock", "Blade", "Intimidate", "Expert: Black Market", "Handgun", "Stealth", "Streetwise"] },
  { name: "Entertainer",       dangerous: false, skills: ["Play Musical Instrument", "Dance", "Gamble", "Hand to Hand", "Seduction", "Social", "Sing"] },
  { name: "ERT Member",        dangerous: true,  skills: ["Medical", "Jury Rig", "Driving", "Athletics", "Survival", "Basic Repair", "Photography & Film"] },
  { name: "Explorer",          dangerous: true,  skills: ["Survival", "Driving", "Persuasion & Fast Talk", "Blade", "Expert: Navigation", "Aircraft/Aeroshuttle Pilot", "Athletics"] },
  { name: "Fleet Officer",     dangerous: true,  skills: ["Leadership", "Expert: Tactics", "Compose or Write", "Zero Gee", "Human Perception", "Handgun", "Personal Grooming"] },
  { name: "Game Designer",     dangerous: false, skills: ["Compose or Write", "Expert: Game Design", "Programming", "Persuasion & Fast Talk", "Teaching", "Awareness/Notice", "Social"] },
  { name: "Gang Member",       dangerous: true,  skills: ["Athletics", "Driving", "Blade", "Dodge & Escape", "Pickpocket", "Streetwise", "Handgun"] },
  { name: "Housewife",         dangerous: false, skills: ["Jury Rig", "Social", "Expert: Domestic Skills", "Persuasion & Fast Talk", "Personal Grooming", "Interrogation", "Awareness/Notice"] },
  { name: "Mecha Designer",    dangerous: false, skills: ["Programming", "Compose or Write", "Jury Rig", "Persuasion & Fast Talk", "Mecha Design", "Mecha Tech", "Basic Repair"] },
  { name: "Mechajock/Combat",  dangerous: true,  skills: ["Mecha Fighting", "Handgun", "Awareness/Notice", "Mecha Piloting", "Mecha Gunnery", "Mecha Missiles", "Mecha Melee"] },
  { name: "Medic",             dangerous: false, skills: ["Medical", "Compose or Write", "Social", "Expert: Diagnosis", "Awareness/Notice", "Persuasion & Fast Talk", "Programming"] },
  { name: "Military Officer",  dangerous: true,  skills: ["Leadership", "Expert: Tactics", "Compose or Write", "Expert: Military History", "Hand to Hand", "Rifle", "Survival"] },
  { name: "Nobleman",          dangerous: false, skills: ["Compose or Write", "Social", "Blade", "Expert: Genealogy", "Dance", "Wardrobe & Style", "Personal Grooming"] },
  { name: "Pilot/Non-Combat",  dangerous: false, skills: ["Mecha Piloting", "Awareness/Notice", "Persuasion & Fast Talk", "Zero Gee", "Basic Repair", "Expert: Navigation", "Aircraft/Aeroshuttle Pilot"] },
  { name: "Politician",        dangerous: false, skills: ["Persuasion & Fast Talk", "Compose or Write", "Driving", "Interview", "Intimidate", "Expert: Law", "Interrogation"] },
  { name: "Racer",             dangerous: true,  skills: ["Driving", "Awareness/Notice", "Streetwise", "Jury Rig", "Basic Repair", "Wardrobe & Style", "Persuasion & Fast Talk"] },
  { name: "Reporter",          dangerous: false, skills: ["Photography & Film", "Stealth", "Compose or Write", "Persuasion & Fast Talk", "Interview", "Pick Lock", "Awareness/Notice"] },
  { name: "Scientist",         dangerous: false, skills: ["Expert: Field Speciality", "Compose or Write", "Jury Rig", "Programming", "Mecha Design", "Photography & Film", "Teaching"] },
  { name: "Soldier/Mercenary", dangerous: true,  skills: ["Blade", "Handgun", "Stealth", "Dodge & Escape", "Hand to Hand", "Rifle", "Survival"] },
  { name: "Spy",               dangerous: true,  skills: ["Persuasion & Fast Talk", "Jury Rig", "Disguise", "Expert: Security Systems", "Resist Torture/Drugs", "Wardrobe & Style", "Shadowing/Avoid Pursuit"] },
  { name: "Techie",            dangerous: false, skills: ["Jury Rig", "Basic Repair", "Handgun", "Mecha Piloting", "Mecha Tech", "Programming", "Streetwise"] },
  { name: "Thief",             dangerous: true,  skills: ["Pick Lock", "Pickpocket", "Stealth", "Shadowing/Avoid Pursuit", "Awareness/Notice", "Dodge & Escape", "Streetwise"] },
];

export function findProfession(name: string): IProfession | undefined {
  return PROFESSIONS.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
}
