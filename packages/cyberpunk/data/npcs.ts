/**
 * Cyberpunk RED -- NPC archetype stat blocks.
 * Source: CPR Core GMing chapter, p.411+ (with Errata v1.25 corrections).
 *
 * Each entry is a complete stat block ready to drop into a scene.
 * Stats are listed as "STAT + Skill" combined values per the rulebook,
 * but stored here as discrete stats and skill levels so the existing
 * roll engine can compose them with d10s and modifiers.
 */
import type { ICPRNpc, NpcTier, ICPRNpcWeapon, ICPRStats } from "../db/schemas.ts";

export interface NpcTemplate {
  id: string;              // lowercase key
  name: string;            // display name
  tier: NpcTier;
  stats: ICPRStats;
  skills: Record<string, number>;
  hp: number;
  armorBody: { name: string; sp: number } | null;
  armorHead: { name: string; sp: number } | null;
  weapon: ICPRNpcWeapon;
}

const stats = (
  int: number, ref: number, dex: number, tech: number, cool: number,
  will: number, luck: number, move: number, body: number, emp: number,
): ICPRStats => ({
  int, ref, dex, tech, cool, will, luck, move, body,
  emp, empBase: emp,
});

export const NPC_TEMPLATES: Record<string, NpcTemplate> = {
  // -- MOOKS ----------------------------------------------------------------

  boosterganger: {
    id: "boosterganger",
    name: "Boosterganger",
    tier: "mook",
    stats: stats(4, 3, 5, 4, 3, 3, 2, 4, 3, 3),
    skills: {
      handgun: 9, drive_land_vehicle: 7, melee_weapon: 6,
      evasion: 4, stealth: 4, brawling: 5, athletics: 4,
      concentration: 3, perception: 4,
    },
    hp: 20,
    armorBody: { name: "Leather", sp: 6 },
    armorHead: { name: "Leather", sp: 6 },
    weapon: { name: "Very Heavy Pistol", skill: "handgun", damageDice: 4 },
  },

  security_operative: {
    id: "security_operative",
    name: "Security Operative",
    tier: "mook",
    stats: stats(3, 3, 2, 5, 3, 3, 2, 4, 5, 3),
    skills: {
      shoulder_arms: 7, autofire: 7, handgun: 7, brawling: 4,
      melee_weapon: 4, evasion: 4, perception: 5, athletics: 4,
      concentration: 4,
    },
    hp: 30,
    armorBody: { name: "Medium Armorjack", sp: 12 },
    armorHead: { name: "Medium Armorjack", sp: 12 },
    weapon: {
      name: "Assault Rifle", skill: "shoulder_arms", damageDice: 5,
      autofire: true, autofireMax: 3,
    },
  },

  // -- LIEUTENANTS ----------------------------------------------------------

  netrunner: {
    id: "netrunner",
    name: "Netrunner",
    tier: "lieutenant",
    stats: stats(7, 5, 4, 7, 4, 4, 3, 5, 3, 3),
    skills: {
      interface: 4, cryptography: 4, electronics_security_tech: 4,
      pick_lock: 4, basic_tech: 6, handgun: 6, evasion: 5,
      perception: 6, concentration: 5,
    },
    hp: 30,
    armorBody: { name: "Bodyweight Suit", sp: 11 },
    armorHead: { name: "Bodyweight Suit", sp: 11 },
    weapon: { name: "Very Heavy Pistol", skill: "handgun", damageDice: 4 },
  },

  security_officer: {
    id: "security_officer",
    name: "Security Officer",
    tier: "lieutenant",
    stats: stats(4, 6, 4, 4, 6, 4, 3, 6, 7, 4),
    skills: {
      shoulder_arms: 6, autofire: 6, handgun: 6, brawling: 6,
      melee_weapon: 6, evasion: 6, perception: 6, athletics: 5,
      concentration: 5, interrogation: 5,
    },
    hp: 40,
    armorBody: { name: "Medium Armorjack", sp: 12 },
    armorHead: { name: "Medium Armorjack", sp: 12 },
    weapon: {
      name: "Assault Rifle", skill: "shoulder_arms", damageDice: 5,
      autofire: true, autofireMax: 3,
    },
  },

  // -- MINI BOSSES ----------------------------------------------------------

  pyro: {
    id: "pyro",
    name: "Pyro",
    tier: "boss",
    stats: stats(5, 4, 6, 7, 5, 4, 4, 6, 5, 3),
    skills: {
      heavy_weapons: 8, handgun: 8, demolition: 6, melee_weapon: 7,
      evasion: 7, perception: 6, athletics: 6, concentration: 6,
      brawling: 6,
    },
    hp: 35,
    armorBody: { name: "Light Armorjack", sp: 11 },
    armorHead: { name: "Light Armorjack", sp: 11 },
    weapon: {
      name: "Heavy Shotgun", skill: "shoulder_arms", damageDice: 5,
    },
  },
};

export const npcArchetypeIds = (): string[] => Object.keys(NPC_TEMPLATES);

export const getNpcTemplate = (id: string): NpcTemplate | null =>
  NPC_TEMPLATES[id.toLowerCase()] ?? null;
