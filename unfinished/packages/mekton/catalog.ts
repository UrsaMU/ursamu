import type { IEquipmentItem } from "./schema.ts";

export type GearCategory = IEquipmentItem["category"];

// ── Skill catalog (all valid skill names) ─────────────────────────────────────
export const SKILL_CATALOG: string[] = [
  // ATT
  "Personal Grooming", "Wardrobe & Style",
  // CL
  "Interrogation", "Intimidate", "Persuasion & Fast Talk", "Resist Torture/Drugs", "Streetwise",
  // EMP
  "Acting", "Human Perception", "Interview", "Leadership", "Seduction", "Social",
  // INT
  "Awareness/Notice", "Compose or Write", "Disguise", "Expert", "Gamble",
  "Know Language", "Programming", "Shadowing/Avoid Pursuit", "Survival", "Teaching",
  // REF personal
  "Automatic Weapon", "Blade", "Dodge & Escape", "Handgun", "Hand to Hand", "Rifle",
  // REF mecha
  "Mecha Fighting", "Mecha Gunnery", "Mecha Melee", "Mecha Missiles", "Mecha Piloting",
  // REF non-combat
  "Aircraft/Aeroshuttle Pilot", "Athletics", "Dance", "Driving", "Stealth", "Swimming", "Zero Gee",
  // TECH
  "Basic Repair", "First Aid", "Jury Rig", "Mecha Design", "Mecha Tech",
  "Medical", "Paint or Draw", "Photography & Film", "Pick Lock", "Pickpocket",
  "Play Musical Instrument", "Sing",
];

// ── Static gear catalog ────────────────────────────────────────────────────────

const MELEE: IEquipmentItem[] = [
  { name: "Battleaxe",    category: "melee", wa: -1, damage: "2D10+[AP]", weight: 3.5, cost: 70,  tl: 2 },
  { name: "Broadsword",   category: "melee", wa:  0, damage: "3D6+[AP]",  weight: 3.0, cost: 84,  tl: 2 },
  { name: "Combat Knife", category: "melee", wa:  0, damage: "1D6+[AP]",  weight: 0.5, cost: 50,  tl: 3, conceal: "P" },
  { name: "Dagger",       category: "melee", wa:  0, damage: "1D6/2+[AP]",weight: 0.3, cost: 18,  tl: 2, conceal: "P" },
  { name: "Energy Sword", category: "melee", wa: +1, damage: "5D6",       weight: 0.25,cost: 470, tl: 7 },
  { name: "Monoknife",    category: "melee", wa:  0, damage: "2D6+[AP]",  weight: 0.5, cost: 240, tl: 6, conceal: "P" },
  { name: "Monosword",    category: "melee", wa: +1, damage: "4D6+[AP]",  weight: 1.0, cost: 600, tl: 6 },
  { name: "Rapier",       category: "melee", wa: +1, damage: "1D10+[AP]", weight: 0.75,cost: 75,  tl: 3 },
  { name: "Sword",        category: "melee", wa: +1, damage: "2D6+[AP]",  weight: 1.0, cost: 100, tl: 2 },
];

const HANDGUNS: IEquipmentItem[] = [
  { name: "AutoMag",        category: "handgun", wa: +1, damage: "3D6", shots: 8,  bv: 1, weight: 1.5,  cost: 437,  tl: 5, conceal: "J" },
  { name: "Combat Pistol",  category: "handgun", wa: +1, damage: "2D6", shots: 15, bv: 1, weight: 1.0,  cost: 310,  tl: 5, conceal: "J" },
  { name: "Energy Pistol",  category: "handgun", wa: +2, damage: "1-4D6",shots: 40,bv: 1, weight: 1.0,  cost: 1256, tl: 7, conceal: "J" },
  { name: "Hideout Pistol", category: "handgun", wa:  0, damage: "1D10", shots: 7,  bv: 1, weight: 0.75, cost: 96,   tl: 5, conceal: "P" },
  { name: "Magnum Revolver",category: "handgun", wa: +2, damage: "4D6",  shots: 6,  bv: 1, weight: 2.0,  cost: 1000, tl: 5, conceal: "J" },
];

const RIFLES: IEquipmentItem[] = [
  { name: "Assault Rifle", category: "rifle", wa:  0, damage: "4D6",   shots: 50, bv: 5, weight: 4.0, cost: 1155, tl: 5, conceal: "N" },
  { name: "Energy Rifle",  category: "rifle", wa: +2, damage: "1-6D6", shots: 60, bv: 1, weight: 3.0, cost: 756,  tl: 7, conceal: "N" },
  { name: "Sniper Rifle",  category: "rifle", wa: +2, damage: "5D6",   shots: 10, bv: 1, weight: 5.0, cost: 775,  tl: 5, conceal: "N" },
  { name: "SMG",           category: "smg",   wa: +1, damage: "2D6",   shots: 50, bv: 5, weight: 2.0, cost: 945,  tl: 5, conceal: "L" },
  { name: "Shotgun",       category: "shotgun",wa: 0, damage: "4D6",   shots: 8,  bv: 1, weight: 3.5, cost: 320,  tl: 4, conceal: "N" },
];

const ARMOR: IEquipmentItem[] = [
  { name: "Light Ballistic Mesh",  category: "armor", sp: 10, location: "Single",       weight: 0.2,  cost: 38,   tl: 5 },
  { name: "Medium Ballistic Mesh", category: "armor", sp: 12, location: "Single",       weight: 0.3,  cost: 47,   tl: 5 },
  { name: "Heavy Ballistic Mesh",  category: "armor", sp: 15, location: "Single",       weight: 0.4,  cost: 56,   tl: 5 },
  { name: "Flak Mesh",             category: "armor", sp: 18, location: "Single",       weight: 0.5,  cost: 65,   tl: 5 },
  { name: "Light Helmet",          category: "armor", sp: 20, location: "Head",         weight: 1.6,  cost: 106,  tl: 5 },
  { name: "Medium Helmet",         category: "armor", sp: 23, location: "Head",         weight: 1.8,  cost: 117,  tl: 5 },
  { name: "Heavy Helmet",          category: "armor", sp: 25, location: "Head",         weight: 2.0,  cost: 128,  tl: 5 },
  { name: "Light Plate",           category: "armor", sp: 20, location: "Single",       weight: 0.5,  cost: 98,   tl: 5 },
  { name: "Medium Plate",          category: "armor", sp: 23, location: "Single",       weight: 0.6,  cost: 108,  tl: 5 },
  { name: "Heavy Plate",           category: "armor", sp: 25, location: "Single",       weight: 1.0,  cost: 119,  tl: 5 },
  { name: "Space Suit (Standard)", category: "armor", sp: 5,  location: "All",          weight: 1.6,  cost: 260,  tl: 5 },
  { name: "Space Suit (Military)", category: "armor", sp: 25, location: "All",          weight: 7.0,  cost: 785,  tl: 5 },
  { name: "Powered Armor",         category: "armor", sp: 28, location: "All",          weight: 43.0, cost: 1056, tl: 7, notes: "Adds +4 EV, ignores own weight" },
  { name: "Personal Force Screen", category: "armor", sp: 18, location: "All",          weight: 5.0,  cost: 1800, tl: 8, notes: "SP is 3D6 per hit" },
  { name: "Advanced Force Screen", category: "armor", sp: 18, location: "All",          weight: 0.5,  cost: 2500, tl: 9 },
  { name: "Flight Jacket",         category: "armor", sp: 12, location: "Torso+Arms",   weight: 1.2,  cost: 300,  tl: 4 },
];

const WEAPON_OPTIONS: IEquipmentItem[] = [
  { name: "Lasersight",    category: "tool", wa: 1,  weight: 0.1, cost: 100,  tl: 5, notes: "+1 WA in combat conditions" },
  { name: "Optical Scope", category: "tool",          weight: 0.2, cost: 100,  tl: 4, notes: "-2 close range, +1 long range" },
  { name: "Silencer",      category: "tool",          weight: 0.5, cost: 100,  tl: 5, notes: "Suppresses report" },
  { name: "Smartgun",      category: "tool", wa: 2,  weight: 0.3, cost: 500,  tl: 6, notes: "+2 WA; requires smartlink" },
];

export const GEAR_CATALOG: IEquipmentItem[] = [
  ...MELEE,
  ...HANDGUNS,
  ...RIFLES,
  ...ARMOR,
  ...WEAPON_OPTIONS,
];

export function findGearByName(name: string): IEquipmentItem | undefined {
  return GEAR_CATALOG.find((g) => g.name.toLowerCase() === name.toLowerCase());
}

export function gearByCategory(category: GearCategory): IEquipmentItem[] {
  return GEAR_CATALOG.filter((g) => g.category === category);
}
