/**
 * Cyberpunk RED — Weapons Catalog
 * Core weapons from the rulebook v1.25. Damage dice, ROF, hands, concealability.
 */
import type { PriceCategory } from "../db/schemas.ts";

export type WeaponType =
  | "pistol" | "shotgun" | "smg" | "rifle" | "sniper"
  | "bow" | "grenade" | "melee_light" | "melee_medium"
  | "melee_heavy" | "melee_v_heavy" | "exotic" | "explosive";

export type SkillKey =
  | "handgun" | "shoulder_arms" | "autofire" | "heavy_weapons"
  | "archery" | "melee_weapon" | "brawling" | "martial_arts";

export interface IWeaponDef {
  name: string;
  type: WeaponType;
  damage: string;          // e.g. "2d6", "3d6"
  damageDice: number;      // number of d6
  rof: number;             // rate of fire
  hands: 1 | 2;
  concealable: boolean;
  skill: SkillKey;
  priceCategory: PriceCategory;
  costEb: number;
  description: string;
  autofire?: boolean;      // can use Autofire skill
  autofireMax?: number;    // max SV for autofire (CPR Core p.195); default 3 if autofire true
  aimed?: boolean;         // can make aimed shots
  singleShot?: boolean;    // must reload after each shot
  burstFire?: boolean;
  attachmentSlots?: number;

  // Area / thrown weapons (grenades, rockets). Set on items that explode.
  areaRadius?: number;     // radius in meters; default 5 for grenades
  thrown?: boolean;        // true => +throw command applies; uses Athletics
  aoeSave?: {              // save-based effect (flashbang, teargas) - no HP dmg
    stat: "will" | "body" | "ref" | "tech";
    dv: number;
    effect: "stunned" | "blinded" | "deafened" | "coughing" | "poisoned" | "asleep";
    duration: number;      // rounds
  };
  damageType?: "kinetic" | "fire" | "biotoxin" | "emp" | "none";
}

export const WEAPONS: IWeaponDef[] = [
  // ── Pistols ─────────────────────────────────────────────────────────────
  {
    name: "medium_pistol",
    type: "pistol",
    damage: "2d6",
    damageDice: 2,
    rof: 2,
    hands: 1,
    concealable: true,
    skill: "handgun",
    priceCategory: "everyday",
    costEb: 50,
    description: "Standard sidearm. Common, reliable, easy to conceal.",
    aimed: true,
    attachmentSlots: 1,
  },
  {
    name: "heavy_pistol",
    type: "pistol",
    damage: "3d6",
    damageDice: 3,
    rof: 2,
    hands: 1,
    concealable: true,
    skill: "handgun",
    priceCategory: "costly",
    costEb: 100,
    description: "High-caliber handgun. More stopping power, harder to conceal.",
    aimed: true,
    attachmentSlots: 1,
  },
  {
    name: "very_heavy_pistol",
    type: "pistol",
    damage: "4d6",
    damageDice: 4,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "handgun",
    priceCategory: "costly",
    costEb: 100,
    description: "Magnum-class handgun. Massive damage, slow fire rate.",
    aimed: true,
    attachmentSlots: 1,
  },

  // ── SMGs ─────────────────────────────────────────────────────────────────
  {
    name: "smg",
    type: "smg",
    damage: "2d6",
    damageDice: 2,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "handgun",
    priceCategory: "costly",
    costEb: 100,
    description: "Compact submachine gun. Concealable; autofire capable.",
    autofire: true,
    autofireMax: 3,
    aimed: true,
    attachmentSlots: 1,
  },
  {
    name: "heavy_smg",
    type: "smg",
    damage: "3d6",
    damageDice: 3,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "autofire",
    priceCategory: "costly",
    costEb: 100,
    description: "Two-handed submachine gun. Higher damage, autofire.",
    autofire: true,
    autofireMax: 3,
    aimed: true,
    attachmentSlots: 2,
  },

  // ── Shotguns ─────────────────────────────────────────────────────────────
  {
    name: "shotgun",
    type: "shotgun",
    damage: "5d6",
    damageDice: 5,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "shoulder_arms",
    priceCategory: "costly",
    costEb: 500,
    description: "Standard pump or semi-auto shotgun. Devastating at close range.",
    aimed: true,
    attachmentSlots: 1,
  },
  {
    name: "combat_shotgun",
    type: "shotgun",
    damage: "5d6",
    damageDice: 5,
    rof: 2,
    hands: 2,
    concealable: false,
    skill: "shoulder_arms",
    priceCategory: "expensive",
    costEb: 500,
    description: "Semi-automatic combat shotgun. Higher ROF than standard.",
    aimed: true,
    autofire: false,
    attachmentSlots: 2,
  },

  // ── Rifles ───────────────────────────────────────────────────────────────
  {
    name: "assault_rifle",
    type: "rifle",
    damage: "5d6",
    damageDice: 5,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "shoulder_arms",
    priceCategory: "expensive",
    costEb: 500,
    description: "Standard military-grade assault rifle. Autofire capable.",
    autofire: true,
    autofireMax: 3,
    aimed: true,
    attachmentSlots: 2,
  },
  {
    name: "sniper_rifle",
    type: "sniper",
    damage: "5d6",
    damageDice: 5,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "shoulder_arms",
    priceCategory: "expensive",
    costEb: 500,
    description: "Long-range precision rifle. No autofire. Excellent at distance.",
    aimed: true,
    singleShot: false,
    attachmentSlots: 2,
  },
  {
    name: "grenade_launcher",
    type: "grenade",
    damage: "6d6",
    damageDice: 6,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "heavy_weapons",
    priceCategory: "very_expensive",
    costEb: 500,
    description: "Shoulder-fired grenade launcher. Blast radius 5m.",
    singleShot: false,
    attachmentSlots: 0,
  },
  {
    name: "rocket_launcher",
    type: "explosive",
    damage: "8d6",
    damageDice: 8,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "heavy_weapons",
    priceCategory: "very_expensive",
    costEb: 1000,
    description: "Anti-vehicle rocket launcher. Massive explosion. Blast 10m.",
    singleShot: true,
    attachmentSlots: 0,
  },

  // ── Bows ─────────────────────────────────────────────────────────────────
  {
    name: "bow",
    type: "bow",
    damage: "2d6",
    damageDice: 2,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "archery",
    priceCategory: "everyday",
    costEb: 50,
    description: "Standard archery bow. Silent, no ammo cost if arrows recovered.",
    aimed: true,
    attachmentSlots: 0,
  },
  {
    name: "crossbow",
    type: "bow",
    damage: "3d6",
    damageDice: 3,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "archery",
    priceCategory: "costly",
    costEb: 100,
    description: "Crossbow. More damage than bow, slower reload.",
    aimed: true,
    singleShot: false,
    attachmentSlots: 1,
  },

  // ── Melee Weapons ────────────────────────────────────────────────────────
  {
    name: "knife",
    type: "melee_light",
    damage: "1d6",
    damageDice: 1,
    rof: 2,
    hands: 1,
    concealable: true,
    skill: "melee_weapon",
    priceCategory: "everyday",
    costEb: 50,
    description: "Combat knife. Fast, concealable.",
    aimed: true,
    attachmentSlots: 0,
  },
  {
    name: "medium_melee",
    type: "melee_medium",
    damage: "2d6",
    damageDice: 2,
    rof: 2,
    hands: 1,
    concealable: false,
    skill: "melee_weapon",
    priceCategory: "everyday",
    costEb: 50,
    description: "Machete, hatchet, or short sword.",
    aimed: true,
    attachmentSlots: 0,
  },
  {
    name: "heavy_melee",
    type: "melee_heavy",
    damage: "3d6",
    damageDice: 3,
    rof: 2,
    hands: 2,
    concealable: false,
    skill: "melee_weapon",
    priceCategory: "costly",
    costEb: 100,
    description: "Axe, hammer, or longsword. Powerful but slow.",
    aimed: true,
    attachmentSlots: 0,
  },
  {
    name: "very_heavy_melee",
    type: "melee_v_heavy",
    damage: "4d6",
    damageDice: 4,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "melee_weapon",
    priceCategory: "costly",
    costEb: 100,
    description: "Two-handed maul or polearm. Devastating. Very slow.",
    aimed: true,
    attachmentSlots: 0,
  },
  // ── Grenades (thrown; default ammo = AP per errata p.345) ───────────────
  {
    name: "frag_grenade",
    type: "grenade",
    damage: "6d6",
    damageDice: 6,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "heavy_weapons",
    priceCategory: "premium",
    costEb: 100,
    description: "Fragmentation grenade. 6d6 damage in a 10m radius.",
    thrown: true,
    areaRadius: 10,
    damageType: "kinetic",
    singleShot: true,
    attachmentSlots: 0,
  },
  {
    name: "sonic_grenade",
    type: "grenade",
    damage: "0d6",
    damageDice: 0,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "heavy_weapons",
    priceCategory: "premium",
    costEb: 100,
    description: "Concussive sonic blast. Stuns; no kinetic damage.",
    thrown: true,
    areaRadius: 10,
    damageType: "none",
    aoeSave: { stat: "body", dv: 15, effect: "stunned", duration: 2 },
    singleShot: true,
    attachmentSlots: 0,
  },
  {
    name: "flashbang",
    type: "grenade",
    damage: "0d6",
    damageDice: 0,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "heavy_weapons",
    priceCategory: "premium",
    costEb: 100,
    description: "Blinds and deafens everyone in 10m. DV15 BODY or impaired.",
    thrown: true,
    areaRadius: 10,
    damageType: "none",
    aoeSave: { stat: "body", dv: 15, effect: "blinded", duration: 2 },
    singleShot: true,
    attachmentSlots: 0,
  },
  {
    name: "teargas_grenade",
    type: "grenade",
    damage: "0d6",
    damageDice: 0,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "heavy_weapons",
    priceCategory: "premium",
    costEb: 100,
    description: "Choking gas. DV15 RES (BODY) or -4 to actions for 1 min.",
    thrown: true,
    areaRadius: 10,
    damageType: "none",
    aoeSave: { stat: "body", dv: 15, effect: "coughing", duration: 6 },
    singleShot: true,
    attachmentSlots: 0,
  },
  {
    name: "biotoxin_grenade",
    type: "grenade",
    damage: "4d6",
    damageDice: 4,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "heavy_weapons",
    priceCategory: "expensive",
    costEb: 500,
    description: "Disperses biotoxin in 10m. DV15 RES or take 4d6 over time.",
    thrown: true,
    areaRadius: 10,
    damageType: "biotoxin",
    aoeSave: { stat: "body", dv: 15, effect: "poisoned", duration: 6 },
    singleShot: true,
    attachmentSlots: 0,
  },
  {
    name: "smoke_grenade",
    type: "grenade",
    damage: "0d6",
    damageDice: 0,
    rof: 1,
    hands: 1,
    concealable: true,
    skill: "heavy_weapons",
    priceCategory: "costly",
    costEb: 50,
    description: "Obscures 10m x 10m for 1 minute. -4 to tasks in the cloud.",
    thrown: true,
    areaRadius: 10,
    damageType: "none",
    singleShot: true,
    attachmentSlots: 0,
  },
  // ── Rockets (loaded into rocket_launcher; default ammo = AP) ────────────
  {
    name: "rpg_a",
    type: "explosive",
    damage: "8d6",
    damageDice: 8,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "heavy_weapons",
    priceCategory: "expensive",
    costEb: 500,
    description: "Anti-personnel rocket. 8d6 in 10m radius.",
    areaRadius: 10,
    damageType: "kinetic",
    singleShot: true,
    attachmentSlots: 0,
  },
  {
    name: "rpg_ap",
    type: "explosive",
    damage: "8d6",
    damageDice: 8,
    rof: 1,
    hands: 2,
    concealable: false,
    skill: "heavy_weapons",
    priceCategory: "expensive",
    costEb: 500,
    description: "Anti-vehicle AP rocket. Halves SP, 8d6 in 5m radius.",
    areaRadius: 5,
    damageType: "kinetic",
    singleShot: true,
    attachmentSlots: 0,
  },
  {
    name: "baseball_bat",
    type: "melee_medium",
    damage: "2d6",
    damageDice: 2,
    rof: 2,
    hands: 1,
    concealable: false,
    skill: "melee_weapon",
    priceCategory: "everyday",
    costEb: 10,
    description: "Improvised club. Same stats as medium melee weapon.",
    aimed: false,
    attachmentSlots: 0,
  },
];

export const getWeapon = (name: string): IWeaponDef | undefined =>
  WEAPONS.find((w) => w.name === name.toLowerCase().replace(/[\s\-]/g, "_"));

export const weaponsByType = (type: WeaponType): IWeaponDef[] =>
  WEAPONS.filter((w) => w.type === type);

/**
 * Return true if a damage roll of `dice` d6 contains 2+ natural 6s (crit trigger).
 * Pass in the individual die results as an array.
 */
export const isCriticalHit = (diceResults: number[]): boolean =>
  diceResults.filter((d) => d === 6).length >= 2;
