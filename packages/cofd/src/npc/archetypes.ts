// NPC archetype registry. Predefined CoFD 2e antagonist stat blocks the
// Storyteller can spawn into a scene with `+npc/create` or
// `+npc/build <name>=<archetype>[/<tier>]`.
//
// Tiers (CoFD 2e Antagonist guidance):
//   minor       - mooks / extras. One trait pool, no merits, max 1 power.
//   major       - named antagonist. Skill specialties, merits, several powers.
//   storyteller - PC-equivalent. Full chargen array, complex powers.
//
// Stat ranges follow CoFD 2e: Attributes/Skills are 1-5; humanoid Size 5;
// health max = Stamina + Size; Willpower max = Resolve + Composure.

import type { CofdSheet } from "../stats/sheet.ts";

/** Power-level tier. */
export type NpcTier = "minor" | "major" | "storyteller";

/** A minimal archetype definition that compiles to a CofdSheet. */
export interface NpcArchetype {
  /** Lowercase key used in commands (e.g. "thug"). */
  key: string;
  /** Human-readable display name. */
  label: string;
  /** One-line description for /list output. */
  blurb: string;
  /** Default power level tier for this archetype. */
  tier: NpcTier;
  /** Attribute dots, lowercase keys to match CofdSheet. */
  attributes: {
    intelligence: number; wits: number; resolve: number;
    strength: number; dexterity: number; stamina: number;
    presence: number; manipulation: number; composure: number;
  };
  /** Key skills (lowercase). Skills not listed default to 0. */
  skills: Record<string, number>;
  /** Optional default merits keyed by lowercase merit name. */
  merits?: Record<string, number>;
  /** Optional default specialties: skill -> list. */
  specialties?: Record<string, string[]>;
  /** Optional default dread power keys (look up in dread_powers.json). */
  dreadPowers?: string[];
  /** Integrity / morality starting value. */
  integrity: number;
  /** Size in dots (humanoid = 5). */
  size: number;
  /** Optional preferred weapon key from the equipment catalog. */
  defaultWeapon?: string;
}

/** Lowercased archetype registry. */
export const NPC_ARCHETYPES: Record<string, NpcArchetype> = {
  thug: {
    key: "thug",
    label: "Thug",
    blurb: "Street muscle. Fists and fury, light on tactics.",
    tier: "minor",
    attributes: {
      intelligence: 2, wits: 2, resolve: 2,
      strength: 3, dexterity: 2, stamina: 3,
      presence: 2, manipulation: 2, composure: 2,
    },
    skills: { brawl: 3, weaponry: 2, intimidation: 2 },
    integrity: 5,
    size: 5,
    defaultWeapon: "club",
  },
  cultist: {
    key: "cultist",
    label: "Cultist",
    blurb: "Devoted believer. Zealous, occult-savvy, expendable.",
    tier: "minor",
    attributes: {
      intelligence: 2, wits: 2, resolve: 3,
      strength: 2, dexterity: 2, stamina: 2,
      presence: 2, manipulation: 3, composure: 2,
    },
    skills: { occult: 3, weaponry: 2, expression: 2 },
    integrity: 4,
    size: 5,
    defaultWeapon: "knife",
  },
  soldier: {
    key: "soldier",
    label: "Soldier",
    blurb: "Trained combatant. Disciplined, armed, professional.",
    tier: "minor",
    attributes: {
      intelligence: 2, wits: 3, resolve: 3,
      strength: 3, dexterity: 3, stamina: 3,
      presence: 2, manipulation: 2, composure: 3,
    },
    skills: { firearms: 3, athletics: 2, brawl: 2, weaponry: 2 },
    integrity: 6,
    size: 5,
    defaultWeapon: "pistol-light",
  },
  beast: {
    key: "beast",
    label: "Beast",
    blurb: "Feral predator. Powerful, fast, no finesse.",
    tier: "minor",
    attributes: {
      intelligence: 1, wits: 3, resolve: 2,
      strength: 4, dexterity: 3, stamina: 4,
      presence: 3, manipulation: 1, composure: 2,
    },
    skills: { brawl: 3, athletics: 3, stealth: 2, survival: 2 },
    integrity: 3,
    size: 5,
  },
  lieutenant: {
    key: "lieutenant",
    label: "Lieutenant",
    blurb: "Mid-tier antagonist. Smart, capable, leads goons.",
    tier: "major",
    attributes: {
      intelligence: 3, wits: 3, resolve: 3,
      strength: 3, dexterity: 3, stamina: 3,
      presence: 3, manipulation: 3, composure: 3,
    },
    skills: { firearms: 2, weaponry: 3, intimidation: 3, persuasion: 2, investigation: 2 },
    merits: { "fast reflexes": 2 },
    integrity: 5,
    size: 5,
    defaultWeapon: "pistol-medium",
  },
  boss: {
    key: "boss",
    label: "Boss",
    blurb: "Major antagonist. Top of the food chain, dangerous on all axes.",
    tier: "major",
    attributes: {
      intelligence: 3, wits: 3, resolve: 4,
      strength: 3, dexterity: 3, stamina: 3,
      presence: 4, manipulation: 4, composure: 4,
    },
    skills: { firearms: 3, weaponry: 3, intimidation: 4, persuasion: 3, subterfuge: 3, occult: 2 },
    merits: { "fast reflexes": 2, "iron stamina": 2 },
    integrity: 4,
    size: 5,
    defaultWeapon: "pistol-heavy",
  },
  hunter: {
    key: "hunter",
    label: "Hunter",
    blurb: "Monster hunter. Investigative, armed, prepared.",
    tier: "major",
    attributes: {
      intelligence: 3, wits: 4, resolve: 3,
      strength: 3, dexterity: 3, stamina: 3,
      presence: 2, manipulation: 2, composure: 3,
    },
    skills: { firearms: 3, occult: 3, investigation: 3, weaponry: 2, stealth: 2, survival: 2 },
    merits: { "fast reflexes": 2 },
    specialties: { occult: ["Strigoi"], firearms: ["Shotguns"] },
    integrity: 5,
    size: 5,
    defaultWeapon: "shotgun-pump",
  },
  professional: {
    key: "professional",
    label: "Professional",
    blurb: "Operator. Clinical, well-equipped, hard to surprise.",
    tier: "major",
    attributes: {
      intelligence: 3, wits: 3, resolve: 3,
      strength: 2, dexterity: 4, stamina: 3,
      presence: 2, manipulation: 3, composure: 4,
    },
    skills: { firearms: 4, larceny: 3, stealth: 3, drive: 2, investigation: 2 },
    merits: { "quick draw": 1, "fast reflexes": 2 },
    integrity: 5,
    size: 5,
    defaultWeapon: "pistol-medium",
  },
  occultist: {
    key: "occultist",
    label: "Occultist",
    blurb: "Mortal practitioner. Rituals, lore, minor numina.",
    tier: "major",
    attributes: {
      intelligence: 4, wits: 3, resolve: 3,
      strength: 2, dexterity: 2, stamina: 2,
      presence: 3, manipulation: 3, composure: 3,
    },
    skills: { occult: 4, academics: 3, expression: 2, persuasion: 2, investigation: 2 },
    specialties: { occult: ["Rituals"] },
    dreadPowers: ["mind-speech", "phantasm"],
    integrity: 5,
    size: 5,
  },
  ghost: {
    key: "ghost",
    label: "Ghost",
    blurb: "Restless dead. Ephemeral, anchored, haunting.",
    tier: "major",
    attributes: {
      intelligence: 2, wits: 3, resolve: 3,
      strength: 2, dexterity: 3, stamina: 2,
      presence: 3, manipulation: 2, composure: 3,
    },
    skills: { intimidation: 3, stealth: 3, occult: 2, subterfuge: 2 },
    dreadPowers: ["materialize", "phantasm", "innocuous"],
    integrity: 4,
    size: 5,
  },
  spirit: {
    key: "spirit",
    label: "Spirit",
    blurb: "Ephemeral being from the Shadow. Numinous, hungry.",
    tier: "major",
    attributes: {
      intelligence: 2, wits: 4, resolve: 3,
      strength: 3, dexterity: 3, stamina: 3,
      presence: 3, manipulation: 2, composure: 3,
    },
    skills: { brawl: 3, intimidation: 3, occult: 2, stealth: 2 },
    dreadPowers: ["materialize", "awe", "mortal-mask"],
    integrity: 4,
    size: 5,
  },
  mastermind: {
    key: "mastermind",
    label: "Mastermind",
    blurb: "Storyteller-tier nemesis. PC-equivalent, layered powers.",
    tier: "storyteller",
    attributes: {
      intelligence: 5, wits: 4, resolve: 4,
      strength: 2, dexterity: 3, stamina: 3,
      presence: 4, manipulation: 5, composure: 4,
    },
    skills: {
      academics: 3, occult: 4, politics: 3, investigation: 3,
      firearms: 2, weaponry: 2, stealth: 2,
      intimidation: 4, persuasion: 4, subterfuge: 4, expression: 3,
    },
    merits: { "fast reflexes": 2, "iron stamina": 3 },
    specialties: { occult: ["Rituals", "Cults"], subterfuge: ["Lies"] },
    dreadPowers: ["mortal-mask", "innocuous", "mind-speech", "dread-aura"],
    integrity: 3,
    size: 5,
    defaultWeapon: "pistol-medium",
  },
};

/** Return the archetype by key (case-insensitive), or null. */
export function getArchetype(key: string): NpcArchetype | null {
  return NPC_ARCHETYPES[key.toLowerCase().trim()] ?? null;
}

/** Stable list of archetype keys (for /list output). */
export function archetypeKeys(): string[] {
  return Object.keys(NPC_ARCHETYPES).sort();
}

/** All valid tier strings, in order from weakest to strongest. */
export const NPC_TIERS: readonly NpcTier[] = ["minor", "major", "storyteller"];

/** Maximum dread powers permitted at each tier. */
export function tierPowerCap(tier: NpcTier): number {
  if (tier === "minor") return 1;
  if (tier === "major") return 3;
  return 6;
}

/** Maximum merits permitted at each tier. */
export function tierMeritCap(tier: NpcTier): number {
  if (tier === "minor") return 0;
  if (tier === "major") return 4;
  return 7;
}

/**
 * Apply tier-based scaling to the base archetype. Higher tier multiplies
 * key attribute/skill pools modestly so that a "soldier" can be promoted
 * to a Storyteller-grade boss without authoring a new archetype.
 */
function scaleForTier(a: NpcArchetype, tier: NpcTier): NpcArchetype {
  if (tier === a.tier) return a;
  const bumpAttr = (v: number, by: number) => Math.min(5, Math.max(1, v + by));
  const bumpSkill = (v: number, by: number) => Math.min(5, Math.max(0, v + by));
  let aDelta = 0;
  let sDelta = 0;
  if (tier === "minor") { aDelta = -1; sDelta = -1; }
  if (tier === "storyteller") { aDelta = 1; sDelta = 1; }
  // major -> base, no shift, when archetype is minor we may still bump.
  if (a.tier === "minor" && tier === "major") { aDelta = 1; sDelta = 1; }
  if (a.tier === "storyteller" && tier === "major") { aDelta = -1; sDelta = -1; }

  const attrs = { ...a.attributes };
  for (const k of Object.keys(attrs) as (keyof typeof attrs)[]) {
    attrs[k] = bumpAttr(attrs[k], aDelta);
  }
  const skills: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.skills)) {
    skills[k] = bumpSkill(v, sDelta);
  }
  return { ...a, attributes: attrs, skills, tier };
}

/**
 * Build a minimal CofdSheet for an NPC from an archetype.
 *
 * @param a   The archetype.
 * @param tier Optional tier override (defaults to archetype's own tier).
 */
export function sheetFromArchetype(
  a: NpcArchetype,
  tier?: NpcTier,
  opts: { aiArchetype?: string; lootTable?: string } = {},
): CofdSheet & {
  npc: {
    archetype: string;
    tier: NpcTier;
    dreadPowers: string[];
    aiArchetype: string;
    lootTable?: string;
  };
} {
  const scaled = tier ? scaleForTier(a, tier) : a;
  const wpMax = scaled.attributes.resolve + scaled.attributes.composure;

  const attributes = {
    intelligence: scaled.attributes.intelligence,
    wits: scaled.attributes.wits,
    resolve: scaled.attributes.resolve,
    strength: scaled.attributes.strength,
    dexterity: scaled.attributes.dexterity,
    stamina: scaled.attributes.stamina,
    presence: scaled.attributes.presence,
    manipulation: scaled.attributes.manipulation,
    composure: scaled.attributes.composure,
  } as unknown as CofdSheet["attributes"];

  const skills = {} as Record<string, number>;
  const allSkills = [
    "academics", "computer", "crafts", "investigation", "medicine",
    "occult", "politics", "science",
    "athletics", "brawl", "drive", "firearms", "larceny", "stealth",
    "survival", "weaponry",
    "animal ken", "empathy", "expression", "intimidation",
    "persuasion", "socialize", "streetwise", "subterfuge",
  ];
  for (const s of allSkills) skills[s] = 0;
  for (const [k, v] of Object.entries(scaled.skills)) skills[k] = v;

  // Tier gates which merits / specialties / dreadPowers actually attach.
  const merits = scaled.tier === "minor" ? {} : { ...(scaled.merits ?? {}) };
  const specialties = scaled.tier === "minor" ? {} : { ...(scaled.specialties ?? {}) };
  const allDread = scaled.dreadPowers ?? [];
  const dreadPowers = allDread.slice(0, tierPowerCap(scaled.tier));

  return {
    template: "mortal",
    concept: `${scaled.label} (NPC)`,
    virtue: "Unknown",
    vice: "Unknown",
    attributes,
    skills: skills as unknown as CofdSheet["skills"],
    specialties,
    merits,
    moralityValue: scaled.integrity,
    powerStatValue: 0,
    energyCurrent: 0,
    customFields: {},
    powers: {},
    advantages: {
      willpowerMax: wpMax,
      willpowerCurrent: wpMax,
      size: scaled.size,
    },
    health: { bashing: 0, lethal: 0, aggravated: 0 },
    conditions: [],
    aspirations: [],
    beats: 0,
    experience: 0,
    arcaneBeats: 0,
    arcaneExperience: 0,
    touchstones: {},
    tempStats: {},
    tilts: [],
    equipment: { equippedWeapon: null, equippedArmor: null },
    npc: {
      archetype: scaled.key,
      tier: scaled.tier,
      dreadPowers,
      aiArchetype: opts.aiArchetype ?? "beshilu-swarmer",
      ...(opts.lootTable ? { lootTable: opts.lootTable } : {}),
    },
  };
}

/** Compute health max for an archetype (stamina + size). */
export function archetypeHealthMax(a: NpcArchetype): number {
  return a.attributes.stamina + a.size;
}

/** Compute Defense = lower of Dex/Wits + Athletics for a sheet. */
export function sheetDefense(sheet: CofdSheet): number {
  const dex = sheet.attributes.dexterity ?? 0;
  const wits = sheet.attributes.wits ?? 0;
  const ath = (sheet.skills as Record<string, number>)["athletics"] ?? 0;
  return Math.min(dex, wits) + ath;
}

/** Initiative modifier = Dex + Composure. */
export function sheetInitiative(sheet: CofdSheet): number {
  return (sheet.attributes.dexterity ?? 0) + (sheet.attributes.composure ?? 0);
}

/** Speed = Strength + Dexterity + Size. */
export function sheetSpeed(sheet: CofdSheet): number {
  return (sheet.attributes.strength ?? 0) +
    (sheet.attributes.dexterity ?? 0) +
    (sheet.advantages?.size ?? 5);
}

/** Health max = Stamina + Size. */
export function sheetHealthMax(sheet: CofdSheet): number {
  return (sheet.attributes.stamina ?? 0) + (sheet.advantages?.size ?? 5);
}
