/**
 * Cyberpunk RED — Cyberware Catalog
 * All cyberware from the core rulebook v1.25 with HL, install type, and cost.
 */
import type { ICyberware, PriceCategory } from "../db/schemas.ts";

export interface ICyberwareDef {
  name: string;
  category: ICyberware["category"] | "borgware";
  hl: number;               // humanity loss on install (0 = fashionware/medical)
  hlRoll?: string;          // dice expression if HL is variable (e.g. "2d6")
  installType: ICyberware["installType"];
  priceCategory: PriceCategory;
  description: string;
  optionSlots?: number;     // how many upgrade slots this item has
  /** Slots consumed in foundation (default 1 if requiresFoundation). */
  slotCost?: number;
  requiresFoundation?: string; // e.g. "neural_link", "cybereye"
  /** Needs two matching foundations (e.g. both eyes / both legs). */
  paired?: boolean;
  /** When true, multiple copies may be installed. */
  allowMultiple?: boolean;
  effect?: string;
}

const CYBERWARE_BASE: ICyberwareDef[] = [
  // ── Fashionware (0 HL) ───────────────────────────────────────────────────
  {
    name: "light_tattoo",
    category: "fashionware",
    hl: 0,
    installType: "mall",
    priceCategory: "costly",
    description: "Subdermal light-storing tattoo that glows on command.",
  },
  {
    name: "chemskin",
    category: "fashionware",
    hl: 0,
    installType: "mall",
    priceCategory: "costly",
    description: "Subdermal pigmentation — change skin color at will.",
  },
  {
    name: "techhair",
    category: "fashionware",
    hl: 0,
    installType: "mall",
    priceCategory: "everyday",
    description: "Color-shifting hair with built-in fiber optics.",
  },
  {
    name: "nailguns",
    category: "fashionware",
    hl: 0,
    installType: "mall",
    priceCategory: "costly",
    description: "Retractable fingernail razors (fashion, not combat-grade).",
  },
  {
    name: "shift_tacts",
    category: "fashionware",
    hl: 0,
    installType: "mall",
    priceCategory: "costly",
    description: "Iris color-shifting contact lenses wired to mood.",
  },

  // ── Neuralware ───────────────────────────────────────────────────────────
  {
    name: "neural_link",
    category: "neuralware",
    hl: 7,
    installType: "clinic",
    priceCategory: "costly",
    description: "Foundation for all neuralware. Required for interface plugs and chipware.",
    optionSlots: 5,
  },
  {
    name: "interface_plugs",
    category: "neuralware",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "Plugs in wrists/temples for jacking into vehicles, weapons, and cyberdecks.",
    requiresFoundation: "neural_link",
  },
  {
    name: "chipware_socket",
    category: "neuralware",
    hl: 7,
    hlRoll: "2d6",
    installType: "clinic",
    priceCategory: "expensive",
    description:
      "Socket in the neck for Chipware. Holds 1 chip. " +
      "Requires Neural Link (uses 1 Neural option slot).",
    requiresFoundation: "neural_link",
    slotCost: 1,
    // Chips mount here — one active chip per socket
    optionSlots: 1,
    allowMultiple: true,
  },
  {
    name: "pain_editor",
    category: "chipware",
    hl: 14,
    hlRoll: "4d6",
    installType: "mall",
    priceCategory: "very_expensive",
    description:
      "Chipware: ignore Seriously Wounded penalties. " +
      "Requires Chipware Socket.",
    requiresFoundation: "chipware_socket",
    slotCost: 1,
  },
  {
    name: "sandevistan_speedware",
    category: "neuralware",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Reflex booster. +3 Initiative when active.",
    requiresFoundation: "neural_link",
  },
  {
    name: "kerenzikov",
    category: "neuralware",
    hl: 0,
    hlRoll: "4d6",
    installType: "hospital",
    priceCategory: "expensive",
    description: "Interruption processor. Take an action when surprised instead of being flat-footed.",
    requiresFoundation: "neural_link",
  },
  {
    name: "skill_chip",
    category: "chipware",
    hl: 7,
    hlRoll: "2d6",
    installType: "mall",
    priceCategory: "expensive",
    description:
      "Hardwired skill chip (Skill at 3 while installed). " +
      "Requires an empty Chipware Socket.",
    requiresFoundation: "chipware_socket",
    slotCost: 1,
    allowMultiple: true,
  },

  // ── Cyberoptics ──────────────────────────────────────────────────────────
  {
    name: "cybereye",
    category: "cyberoptics",
    hl: 7,
    hlRoll: "2d6",
    installType: "clinic",
    priceCategory: "premium",
    description:
      "Artificial eye foundation (3 option slots). Buy twice for a pair.",
    optionSlots: 3,
    allowMultiple: true,
  },
  {
    name: "image_enhance",
    category: "cyberoptics",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "+2 to Perception checks (vision) while active.",
    requiresFoundation: "cybereye",
  },
  {
    name: "targeting_scope",
    category: "cyberoptics",
    hl: 3,
    installType: "clinic",
    priceCategory: "expensive",
    description: "+1 to all Ranged Attacks while active.",
    requiresFoundation: "cybereye",
  },
  {
    name: "infrared",
    category: "cyberoptics",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "See heat signatures in darkness.",
    requiresFoundation: "cybereye",
  },
  {
    name: "low_light",
    category: "cyberoptics",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "No penalties in dim or low-light conditions.",
    requiresFoundation: "cybereye",
  },
  {
    name: "micro_optics",
    category: "cyberoptics",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "Microscopic vision. Examine tiny details.",
    requiresFoundation: "cybereye",
  },
  {
    name: "teleoptics",
    category: "cyberoptics",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "Telescopic zoom. No range penalties at medium range.",
    requiresFoundation: "cybereye",
  },
  {
    name: "uv",
    category: "cyberoptics",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "See ultraviolet light.",
    requiresFoundation: "cybereye",
  },

  // ── Cyberaudio ───────────────────────────────────────────────────────────
  {
    name: "cyberaudio_suite",
    category: "cyberaudio",
    hl: 7,
    installType: "clinic",
    priceCategory: "costly",
    description: "Replacement ear. Foundation for audio cyberware.",
    optionSlots: 3,
  },
  {
    name: "amplified_hearing",
    category: "cyberaudio",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "+2 to Perception checks (hearing).",
    requiresFoundation: "cyberaudio_suite",
  },
  {
    name: "audio_recorder",
    category: "cyberaudio",
    hl: 3,
    installType: "mall",
    priceCategory: "costly",
    description: "Record and replay audio.",
    requiresFoundation: "cyberaudio_suite",
  },
  {
    name: "homing_tracer",
    category: "cyberaudio",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "Track a tagged target's location.",
    requiresFoundation: "cyberaudio_suite",
  },
  {
    name: "scrambler",
    category: "cyberaudio",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "Encode all outgoing communications.",
    requiresFoundation: "cyberaudio_suite",
  },
  {
    name: "voice_stress_analyzer",
    category: "cyberaudio",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "+2 to Human Perception when listening for lies.",
    requiresFoundation: "cyberaudio_suite",
  },

  // ── Internal Cyberware ───────────────────────────────────────────────────
  {
    name: "subdermal_armor",
    category: "internal",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "expensive",
    description: "SP 11 under-skin plating. Does not stack with worn armor — use highest SP.",
  },
  {
    name: "skin_weave",
    category: "internal",
    hl: 7,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "costly",
    description: "SP 7 woven subdermal mesh. Does not stack with worn armor — use highest SP.",
  },
  {
    name: "subdermal_pocket",
    category: "internal",
    hl: 7,
    installType: "clinic",
    priceCategory: "costly",
    description: "Concealed internal pocket. Can hide small items.",
  },
  {
    name: "toxin_binders",
    category: "internal",
    hl: 7,
    installType: "clinic",
    priceCategory: "costly",
    description: "Resist Torture/Drugs +2. Halve drug durations.",
  },
  {
    name: "nasal_filters",
    category: "internal",
    hl: 3,
    installType: "clinic",
    priceCategory: "costly",
    description: "Filter dangerous airborne particles and chemicals.",
  },
  {
    name: "gills",
    category: "internal",
    hl: 7,
    installType: "hospital",
    priceCategory: "expensive",
    description: "Breathe underwater indefinitely.",
  },
  {
    name: "enhanced_antibodies",
    category: "internal",
    hl: 7,
    installType: "clinic",
    priceCategory: "expensive",
    description: "Heal 1 additional HP per day. Resist infection.",
  },
  {
    name: "grafted_muscle",
    category: "internal",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "expensive",
    description: "+2 BODY for HP, melee damage, and lifting calculations.",
  },
  {
    name: "midnight_lady",
    category: "internal",
    hl: 7,
    installType: "clinic",
    priceCategory: "very_expensive",
    description: "Subdermal sexual features and pheromone system.",
  },

  // ── External Cyberware ───────────────────────────────────────────────────
  {
    name: "big_knucks",
    category: "external",
    hl: 7,
    installType: "clinic",
    priceCategory: "costly",
    description: "Reinforced knuckles. Unarmed attacks deal 2d6 damage.",
  },
  {
    name: "rippers",
    category: "external",
    hl: 7,
    installType: "clinic",
    priceCategory: "costly",
    description: "Retractable claws. Melee attack: 2d6 damage.",
  },
  {
    name: "wolvers",
    category: "external",
    hl: 7,
    installType: "clinic",
    priceCategory: "expensive",
    description: "Extendable blade fingers. Melee: 3d6 damage.",
  },
  {
    name: "scratchers",
    category: "external",
    hl: 0,
    installType: "mall",
    priceCategory: "costly",
    description: "Retractable fashion claws. Damage: 1d6.",
  },
  {
    name: "monowire_whip",
    category: "external",
    hl: 7,
    installType: "clinic",
    priceCategory: "very_expensive",
    description: "Filament whip from finger. Melee: 3d6 damage, can attack from 3m.",
  },
  {
    name: "mantis_blades",
    category: "external",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Forearm-mounted blades. Melee: 3d6 damage.",
  },
  {
    name: "cybersnake",
    category: "external",
    hl: 7,
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Flexible tentacle from mouth. Melee: 1d6 + suffocate.",
  },
  {
    name: "microwaver",
    category: "external",
    hl: 7,
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Microwave emitter in palm. Ranged: 2d6 to 3 targets in 1m of each other.",
  },
  {
    name: "popup_grenade_launcher",
    category: "external",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Forearm-mounted grenade launcher. Uses Heavy Weapons skill.",
  },
  {
    name: "shoulder_mounted_launcher",
    category: "external",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Shoulder rocket/grenade launcher. Uses Heavy Weapons skill.",
  },

  // ── Cyberlimbs ───────────────────────────────────────────────────────────
  {
    name: "cyberarm",
    category: "cyberlimb",
    hl: 7,
    hlRoll: "2d6",
    installType: "clinic",
    priceCategory: "expensive",
    description: "Replacement arm. SP 20, HP 20. Has 4 option slots.",
    optionSlots: 4,
    allowMultiple: true,
  },
  {
    name: "cyberleg",
    category: "cyberlimb",
    hl: 7,
    hlRoll: "2d6",
    installType: "clinic",
    priceCategory: "expensive",
    description: "Replacement leg. SP 20, HP 20. Has 3 option slots.",
    optionSlots: 3,
    allowMultiple: true,
  },
  {
    name: "gorilla_arm",
    category: "cyberlimb",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Massive reinforced arm. Brawling damage: 2d6. STR-equivalent +4.",
    optionSlots: 2,
  },
  {
    name: "hydraulic_legs",
    category: "cyberlimb",
    hl: 0,
    hlRoll: "2d6",
    installType: "hospital",
    priceCategory: "very_expensive",
    description: "Enhanced legs. +4 MOVE for running. Leaping bonus.",
    optionSlots: 2,
  },
  {
    name: "quick_change_mount",
    category: "cyberlimb",
    hl: 0,
    installType: "clinic",
    priceCategory: "costly",
    description: "Allows rapid swapping of cyberlimb. No HL. Requires existing cyberlimb.",
    requiresFoundation: "cyberarm",
    slotCost: 0,
  },
];

import { CYBERWARE_EXTRA } from "./cyberware-extra.ts";

function mergeCatalog(
  base: readonly ICyberwareDef[],
  extra: readonly ICyberwareDef[],
): ICyberwareDef[] {
  const map = new Map<string, ICyberwareDef>();
  for (const c of base) map.set(c.name, c);
  for (const c of extra) {
    // Extra fills gaps; base wins on name clash
    if (!map.has(c.name)) map.set(c.name, c);
  }
  // Default slotCost for options
  return [...map.values()].map((c) => {
    if (c.requiresFoundation && c.slotCost == null) {
      return { ...c, slotCost: 1 };
    }
    return c;
  });
}

export const CYBERWARE_CATALOG: ICyberwareDef[] = mergeCatalog(
  CYBERWARE_BASE,
  CYBERWARE_EXTRA,
);

/** "Subdermal Armor" / "subdermal-armor" → "subdermal_armor" */
export function slugCyberName(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Human label for messages: "subdermal_armor" → "subdermal armor" */
export function displayCyberName(raw: string): string {
  return slugCyberName(raw).replace(/_/g, " ");
}

export const getCyberware = (name: string): ICyberwareDef | undefined => {
  const slug = slugCyberName(name);
  if (!slug) return undefined;
  return CYBERWARE_CATALOG.find((c) => c.name === slug);
};

export const cyberwareByCategory = (
  category: ICyberware["category"]
): ICyberwareDef[] =>
  CYBERWARE_CATALOG.filter((c) => c.category === category);

/**
 * Install DV for surgery based on install type.
 * Also used for harvesting DV.
 */
export const installDV = (type: ICyberware["installType"]): number => {
  if (type === "mall") return 13;
  if (type === "clinic") return 15;
  return 17; // hospital
};

/** Hospital cost for installation (not the cyberware itself). */
export const installCost = (type: ICyberware["installType"]): number => {
  if (type === "mall") return 100;   // Premium
  if (type === "clinic") return 500; // Expensive
  return 1000;                        // Very Expensive
};
