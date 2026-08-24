/**
 * Cyberpunk RED — Scavenge Zone Loot Tables
 * Characters roll INT (or relevant skill) vs zone DV to find items.
 * Higher danger zones = harder DV but better loot.
 */
import type { PriceCategory } from "../db/schemas.ts";

export type ZoneDanger = "safe" | "contested" | "hot" | "combat" | "hellhole";

export interface IZoneDef {
  name: ZoneDanger;
  displayName: string;
  scavengeDV: number;
  ambushChance: number;  // 0–10: roll > this on 1d10 = ambush
  description: string;
}

export interface ILootEntry {
  weight: number;    // relative probability weight
  name: string;
  description: string;
  priceCategory: PriceCategory;
  ebRange: [number, number];  // [min, max] Eurodollars found
  type: "weapon" | "armor" | "ammo" | "drug" | "cyberware" | "gear" | "eb" | "junk";
  condition: "pristine" | "used" | "damaged";
  weaponRef?: string;    // weapon catalog name if type === "weapon"
  armorRef?: string;
  cyberwareRef?: string;
  drugRef?: string;
}

export const ZONES: IZoneDef[] = [
  {
    name: "safe",
    displayName: "Safe Zone",
    scavengeDV: 9,
    ambushChance: 0,
    description: "Relatively calm area. Corporate controlled or well-policed.",
  },
  {
    name: "contested",
    displayName: "Contested Zone",
    scavengeDV: 13,
    ambushChance: 2,
    description: "Gang territory or fringe area. Occasional violence.",
  },
  {
    name: "hot",
    displayName: "Hot Zone",
    scavengeDV: 15,
    ambushChance: 4,
    description: "Active gang wars or corporate skirmishes. Dangerous.",
  },
  {
    name: "combat",
    displayName: "Combat Zone",
    scavengeDV: 17,
    ambushChance: 6,
    description: "Open warfare. Gangs, militias, abandoned corp facilities.",
  },
  {
    name: "hellhole",
    displayName: "Hellhole",
    scavengeDV: 21,
    ambushChance: 8,
    description: "Complete lawlessness. Extreme danger. Best loot if you survive.",
  },
];

// Loot tables by zone — higher danger = better loot
export const LOOT_TABLES: Record<ZoneDanger, ILootEntry[]> = {
  safe: [
    { weight: 30, name: "Loose Eurodollars", description: "Scattered cash.", priceCategory: "cheap", ebRange: [5, 25], type: "eb", condition: "pristine" },
    { weight: 20, name: "Basic Supplies", description: "Water, food, basic gear.", priceCategory: "cheap", ebRange: [10, 30], type: "gear", condition: "used" },
    { weight: 20, name: "Knife", description: "A serviceable combat knife.", priceCategory: "everyday", ebRange: [10, 50], type: "weapon", condition: "used", weaponRef: "knife" },
    { weight: 15, name: "Leather Jacket", description: "A battered leather jacket.", priceCategory: "everyday", ebRange: [10, 20], type: "armor", condition: "damaged", armorRef: "leather_jacket" },
    { weight: 10, name: "Dorph", description: "A few doses of street stim.", priceCategory: "everyday", ebRange: [20, 50], type: "drug", condition: "pristine", drugRef: "dorph" },
    { weight: 5, name: "Junk", description: "Useless scrap. Worth nothing.", priceCategory: "cheap", ebRange: [0, 5], type: "junk", condition: "damaged" },
  ],

  contested: [
    { weight: 25, name: "Eurodollars", description: "Cash from a dead ganger.", priceCategory: "cheap", ebRange: [20, 80], type: "eb", condition: "pristine" },
    { weight: 20, name: "Medium Pistol", description: "A ganger's sidearm.", priceCategory: "everyday", ebRange: [25, 50], type: "weapon", condition: "used", weaponRef: "medium_pistol" },
    { weight: 15, name: "Kevlar T-Shirt", description: "Ballistic undershirt.", priceCategory: "costly", ebRange: [25, 50], type: "armor", condition: "used", armorRef: "kevlar_t_shirt" },
    { weight: 15, name: "Ammo Cache", description: "Mixed ammunition.", priceCategory: "cheap", ebRange: [30, 60], type: "ammo", condition: "pristine" },
    { weight: 10, name: "Stim", description: "Combat stimulant dose.", priceCategory: "costly", ebRange: [30, 50], type: "drug", condition: "pristine", drugRef: "stim" },
    { weight: 10, name: "Black Lace", description: "Street combat drug.", priceCategory: "costly", ebRange: [40, 60], type: "drug", condition: "pristine", drugRef: "black_lace" },
    { weight: 5, name: "Scrap Cyberware", description: "Damaged cyberware. Needs repair.", priceCategory: "cheap", ebRange: [50, 150], type: "cyberware", condition: "damaged" },
  ],

  hot: [
    { weight: 20, name: "Heavy Pistol", description: "Military-grade sidearm.", priceCategory: "costly", ebRange: [60, 100], type: "weapon", condition: "used", weaponRef: "heavy_pistol" },
    { weight: 15, name: "SMG", description: "A compact submachine gun.", priceCategory: "costly", ebRange: [60, 100], type: "weapon", condition: "used", weaponRef: "smg" },
    { weight: 15, name: "Light Armorjack", description: "Tactical body armor.", priceCategory: "costly", ebRange: [50, 100], type: "armor", condition: "used", armorRef: "light_armorjack" },
    { weight: 15, name: "Eurodollars", description: "Corp payroll drop.", priceCategory: "costly", ebRange: [100, 300], type: "eb", condition: "pristine" },
    { weight: 10, name: "Antibiotic", description: "Medical supplies.", priceCategory: "costly", ebRange: [30, 50], type: "drug", condition: "pristine", drugRef: "antibiotic" },
    { weight: 10, name: "Cyberware Fragment", description: "Partially intact cyberware. Needs medtech to assess.", priceCategory: "costly", ebRange: [100, 250], type: "cyberware", condition: "damaged" },
    { weight: 10, name: "Boost", description: "Combat chem.", priceCategory: "expensive", ebRange: [60, 100], type: "drug", condition: "pristine", drugRef: "boost" },
    { weight: 5, name: "Cyberoptic", description: "Intact cybereye.", priceCategory: "costly", ebRange: [150, 300], type: "cyberware", condition: "used", cyberwareRef: "cybereye" },
  ],

  combat: [
    { weight: 20, name: "Shotgun", description: "Combat shotgun.", priceCategory: "expensive", ebRange: [200, 500], type: "weapon", condition: "used", weaponRef: "shotgun" },
    { weight: 15, name: "Assault Rifle", description: "Military assault rifle.", priceCategory: "expensive", ebRange: [300, 500], type: "weapon", condition: "used", weaponRef: "assault_rifle" },
    { weight: 15, name: "Medium Armorjack", description: "Full body armor.", priceCategory: "costly", ebRange: [300, 500], type: "armor", condition: "used", armorRef: "medium_armorjack" },
    { weight: 15, name: "Eurodollars", description: "Corp payroll or arms cache money.", priceCategory: "expensive", ebRange: [300, 800], type: "eb", condition: "pristine" },
    { weight: 10, name: "Neural Link", description: "Intact neural link.", priceCategory: "costly", ebRange: [200, 400], type: "cyberware", condition: "used", cyberwareRef: "neural_link" },
    { weight: 10, name: "Speedheal", description: "Military medkit.", priceCategory: "expensive", ebRange: [80, 100], type: "drug", condition: "pristine", drugRef: "speedheal" },
    { weight: 10, name: "Interface Plugs", description: "Wrist plugs. Intact.", priceCategory: "costly", ebRange: [100, 200], type: "cyberware", condition: "used", cyberwareRef: "interface_plugs" },
    { weight: 5, name: "Cyberarm", description: "Full replacement arm. Damaged.", priceCategory: "expensive", ebRange: [400, 800], type: "cyberware", condition: "damaged", cyberwareRef: "cyberarm" },
  ],

  hellhole: [
    { weight: 20, name: "Eurodollars", description: "Massive haul from dead corps.", priceCategory: "very_expensive", ebRange: [500, 2000], type: "eb", condition: "pristine" },
    { weight: 15, name: "Sniper Rifle", description: "High-end precision rifle.", priceCategory: "expensive", ebRange: [400, 500], type: "weapon", condition: "used", weaponRef: "sniper_rifle" },
    { weight: 15, name: "Heavy Armorjack", description: "Full tactical armor.", priceCategory: "expensive", ebRange: [600, 1000], type: "armor", condition: "used", armorRef: "heavy_armorjack" },
    { weight: 15, name: "Subdermal Armor", description: "Military cyberware. Damaged.", priceCategory: "expensive", ebRange: [500, 900], type: "cyberware", condition: "damaged", cyberwareRef: "subdermal_armor" },
    { weight: 10, name: "Cyberleg", description: "Full replacement leg.", priceCategory: "expensive", ebRange: [700, 1000], type: "cyberware", condition: "damaged", cyberwareRef: "cyberleg" },
    { weight: 10, name: "Targeting Scope", description: "Optical targeting system.", priceCategory: "expensive", ebRange: [400, 600], type: "cyberware", condition: "used", cyberwareRef: "targeting_scope" },
    { weight: 10, name: "Sandevistan Speedware", description: "Reflex booster. Military grade.", priceCategory: "very_expensive", ebRange: [2000, 5000], type: "cyberware", condition: "damaged", cyberwareRef: "sandevistan_speedware" },
    { weight: 5, name: "Rocket Launcher", description: "Anti-vehicle ordinance.", priceCategory: "very_expensive", ebRange: [800, 1000], type: "weapon", condition: "used", weaponRef: "rocket_launcher" },
  ],
};

/** Roll a weighted random loot entry from a table. */
export const rollLoot = (zone: ZoneDanger): ILootEntry => {
  const table = LOOT_TABLES[zone];
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.floor(Math.random() * total);
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return table[table.length - 1];
};

export const getZone = (name: ZoneDanger): IZoneDef =>
  ZONES.find((z) => z.name === name) ?? ZONES[0];
