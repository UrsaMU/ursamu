/**
 * Cyberpunk RED — NET Programs and Black ICE
 * All Netrunner programs and ICE types from the core rulebook v1.25.
 */
import type { PriceCategory } from "../db/schemas.ts";

export type ProgramType = "attack" | "defense" | "utility" | "stealth" | "ice";

export interface IProgramDef {
  effect?: string;
  name: string;
  displayName: string;
  type: ProgramType;
  atk?: number;       // ATK value for offensive programs
  def?: number;       // DEF value for defensive programs
  rez?: number;       // REZ (hit points) of the program
  strength?: number;  // Strength value (ICE and attack programs)
  priceCategory: PriceCategory;
  costEb: number;
  description: string;
  /** For ICE: what happens when it activates. */
  iceEffect?: string;
}

export const PROGRAMS: IProgramDef[] = [
  // ── Offensive Programs ────────────────────────────────────────────────────
  {
    name: "sword",
    displayName: "Sword",
    type: "attack",
    atk: 3,
    rez: 15,
    priceCategory: "costly",
    costEb: 100,
    description: "Standard attack program. ATK 3 vs ICE REZ.",
  },
  {
    name: "banhammer",
    displayName: "Banhammer",
    type: "attack",
    atk: 4,
    rez: 20,
    priceCategory: "expensive",
    costEb: 500,
    description: "Heavy attack program. ATK 4 vs ICE REZ.",
  },
  {
    name: "vrizzbolt",
    displayName: "Vrizzbolt",
    type: "attack",
    atk: 2,
    rez: 10,
    priceCategory: "everyday",
    costEb: 50,
    description: "Budget attack program. ATK 2. Good starting option.",
  },
  {
    name: "zap",
    displayName: "Zap",
    type: "attack",
    atk: 1,
    rez: 5,
    priceCategory: "everyday",
    costEb: 10,
    description: "Basic attack. ATK 1. Interface Ability version is free.",
  },

  // ── Defensive Programs ────────────────────────────────────────────────────
  {
    name: "armor",
    displayName: "Armor",
    type: "defense",
    def: 5,
    rez: 20,
    priceCategory: "costly",
    costEb: 100,
    description: "Reduces damage taken by 5 per hit while active. DEF 5.",
  },
  {
    name: "flak",
    displayName: "Flak",
    type: "defense",
    def: 3,
    rez: 15,
    priceCategory: "everyday",
    costEb: 50,
    description: "Budget defense program. DEF 3.",
  },

  // ── Stealth/Utility Programs ──────────────────────────────────────────────
  {
    name: "see_ya",
    displayName: "See Ya",
    type: "stealth",
    rez: 10,
    priceCategory: "costly",
    costEb: 100,
    description: "Cloaks Netrunner's presence. Makes tracking harder. Interface version (Cloak) is free.",
  },
  {
    name: "worm",
    displayName: "Worm",
    type: "utility",
    rez: 10,
    priceCategory: "costly",
    costEb: 100,
    description: "Move data between architecture nodes. Copy or transfer files.",
  },
  {
    name: "eraser",
    displayName: "Eraser",
    type: "utility",
    rez: 10,
    priceCategory: "costly",
    costEb: 100,
    description: "Destroy data on a floor. Permanently delete files.",
  },
  {
    name: "virus",
    displayName: "Virus",
    type: "utility",
    rez: 15,
    priceCategory: "expensive",
    costEb: 500,
    description: "Leave a custom virus at architecture core. Interface version (Virus) is free.",
  },

  // ── Black ICE ─────────────────────────────────────────────────────────────
  {
    name: "asp",
    displayName: "Asp",
    type: "ice",
    atk: 2,
    rez: 10,
    strength: 2,
    priceCategory: "costly",
    costEb: 100,
    description: "Tracking ICE. Follows Netrunner through architecture.",
    iceEffect: "Deals 2 damage to Netrunner's body each time it attacks.",
  },
  {
    name: "raven",
    displayName: "Raven",
    type: "ice",
    atk: 4,
    rez: 15,
    strength: 4,
    priceCategory: "expensive",
    costEb: 500,
    description: "Aggressive combat ICE.",
    iceEffect: "Deals 4 damage to Netrunner. Calls for additional ICE.",
  },
  {
    name: "killer",
    displayName: "Killer",
    type: "ice",
    atk: 6,
    rez: 20,
    strength: 6,
    priceCategory: "very_expensive",
    costEb: 1000,
    description: "Military-grade Black ICE. Designed to kill.",
    iceEffect: "Deals 6 damage directly to Netrunner. Can induce flatline.",
  },
  {
    name: "hellhound",
    displayName: "Hellhound",
    type: "ice",
    atk: 8,
    rez: 30,
    strength: 8,
    priceCategory: "luxury",
    costEb: 5000,
    description: "Top-tier Corporate ICE. Lethal on contact.",
    iceEffect: "Deals 8 damage. Locks Netrunner in architecture until destroyed.",
  },
  {
    name: "scorpion",
    displayName: "Scorpion",
    type: "ice",
    atk: 3,
    rez: 15,
    strength: 3,
    priceCategory: "costly",
    costEb: 200,
    description: "Stun ICE. Non-lethal but disabling.",
    iceEffect: "Stuns Netrunner for 1 NET turn. Cannot take actions while stunned.",
  },
  {
    name: "kraken",
    displayName: "Kraken",
    type: "ice",
    atk: 5,
    rez: 25,
    strength: 5,
    priceCategory: "expensive",
    costEb: 500,
    description: "Trapping ICE. Prevents exit without defeating it.",
    iceEffect: "Deals 5 damage. Netrunner cannot use Slide until Kraken is destroyed.",
  },
];

/** All Netrunner Interface Ability names (free, no program required). */
export const INTERFACE_ABILITIES = [
  {
    name: "backdoor",
    description: "Break through Passwords/obstructions without using a program.",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "cloak",
    description: "Hide your actions and presence before leaving an Architecture.",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "control",
    description: "Take control of hardware or systems attached to the Architecture.",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "eye_dee",
    description: "Identify a piece of data: what it is and its Eurodollar value.",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "pathfinder",
    description: "Learn the layout of the Architecture (number of floors, types).",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "scanner",
    description: "Locate all systems connected to an Architecture in the area.",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "slide",
    description: "Slip away from one Black ICE that is currently following you.",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "virus",
    description: "Leave a custom virus at the Architecture core.",
    rollBase: "int",
    skill: "interface",
  },
  {
    name: "zap",
    description: "Basic attack against Programs and other Netrunners. ATK = Interface Rank.",
    rollBase: "int",
    skill: "interface",
  },
] as const;

export type InterfaceAbilityName = (typeof INTERFACE_ABILITIES)[number]["name"];

export const getProgram = (name: string): IProgramDef | undefined =>
  PROGRAMS.find((p) => p.name === name.toLowerCase().replace(/[\s\-]/g, "_"));

export const getIce = (): IProgramDef[] =>
  PROGRAMS.filter((p) => p.type === "ice");

export const getOffensivePrograms = (): IProgramDef[] =>
  PROGRAMS.filter((p) => p.type === "attack");
