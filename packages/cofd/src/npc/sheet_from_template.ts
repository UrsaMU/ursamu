// Build a CofdSheet (and object state bits) from an NpcTemplate.
// Used by +npc/build, zone spawn, and combat auto-spawn.

import type { CofdSheet } from "../stats/sheet.ts";
import type {
  NpcTemplate,
  NpcTier,
} from "./types.ts";
import {
  resolveAiConfig,
  resolveSpawnFlavor,
} from "./types.ts";

const ALL_SKILLS = [
  "academics",
  "computer",
  "crafts",
  "investigation",
  "medicine",
  "occult",
  "politics",
  "science",
  "athletics",
  "brawl",
  "drive",
  "firearms",
  "larceny",
  "stealth",
  "survival",
  "weaponry",
  "animal ken",
  "empathy",
  "expression",
  "intimidation",
  "persuasion",
  "socialize",
  "streetwise",
  "subterfuge",
];

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

function bumpAttr(v: number, by: number): number {
  return Math.min(5, Math.max(1, v + by));
}

function bumpSkill(v: number, by: number): number {
  return Math.min(5, Math.max(0, v + by));
}

/**
 * Apply tier-based scaling to template stats. Higher tier bumps attrs/skills
 * so a "soldier" can be promoted without a new JSON file.
 */
export function scaleTemplate(
  t: NpcTemplate,
  tier: NpcTier,
): NpcTemplate {
  if (tier === t.tier) return { ...t, tier };
  let aDelta = 0;
  let sDelta = 0;
  if (tier === "minor") {
    aDelta = -1;
    sDelta = -1;
  }
  if (tier === "storyteller") {
    aDelta = 1;
    sDelta = 1;
  }
  if (t.tier === "minor" && tier === "major") {
    aDelta = 1;
    sDelta = 1;
  }
  if (t.tier === "storyteller" && tier === "major") {
    aDelta = -1;
    sDelta = -1;
  }

  const attributes = { ...t.attributes };
  for (const k of Object.keys(attributes) as (keyof typeof attributes)[]) {
    attributes[k] = bumpAttr(attributes[k], aDelta);
  }
  const skills: Record<string, number> = {};
  for (const [k, v] of Object.entries(t.skills)) {
    skills[k] = bumpSkill(v, sDelta);
  }
  return { ...t, attributes, skills, tier };
}

function sheetTemplateKey(lineage: string): string {
  if (lineage === "werewolf") return "werewolf";
  if (
    lineage === "changeling" ||
    lineage === "hobgoblin" ||
    lineage === "huntsman" ||
    lineage === "fetch" ||
    lineage === "true-fae"
  ) {
    return "changeling";
  }
  return "mortal";
}

export interface NpcSheetNpcMeta {
  archetype: string;
  tier: NpcTier;
  dreadPowers: string[];
  aiArchetype: string;
  lootTable?: string;
  lineage?: string;
  presence?: string;
  aggro?: string;
  lookMode?: string;
  startRevealed?: boolean;
  defaultWeapon?: string;
  defaultArmor?: string;
  /** Resolved at spawn (not arrays). */
  shortDesc?: string;
  description?: string;
  mask?: string | null;
  mien?: string;
  zoneId?: string;
  homeRoomId?: string;
  wanderRange?: number;
}

export type NpcCofdSheet = CofdSheet & { npc: NpcSheetNpcMeta };

export interface SheetFromTemplateOpts {
  aiArchetype?: string;
  lootTable?: string;
  /** Injected RNG for flavor arrays (tests). Default Math.random. */
  rng?: () => number;
}

/**
 * Build a CofdSheet from a JSON NPC template.
 * Picks random flavor once; stamp onto sheet.npc for spawn to apply.
 */
export function sheetFromTemplate(
  t: NpcTemplate,
  tier?: NpcTier,
  opts: SheetFromTemplateOpts = {},
): NpcCofdSheet {
  const effectiveTier = tier ?? t.tier;
  const scaled = scaleTemplate(t, effectiveTier);
  const ai = resolveAiConfig(scaled.ai);
  const flavor = resolveSpawnFlavor(scaled, opts.rng ?? Math.random);

  const wpMax =
    scaled.attributes.resolve + scaled.attributes.composure;

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
  for (const s of ALL_SKILLS) skills[s] = 0;
  for (const [k, v] of Object.entries(scaled.skills)) {
    skills[k] = v;
  }

  const merits = scaled.tier === "minor"
    ? {}
    : { ...(scaled.merits ?? {}) };
  const specialties = scaled.tier === "minor"
    ? {}
    : { ...(scaled.specialties ?? {}) };
  const allDread = scaled.dreadPowers ?? [];
  const dreadPowers = allDread.slice(0, tierPowerCap(scaled.tier));

  const lootTable =
    opts.lootTable ?? scaled.defaults?.lootTable;
  const aiKey = opts.aiArchetype ?? ai.archetype;

  let powerStatValue = 0;
  let energyCurrent = 0;
  let moralityValue = scaled.integrity;
  const customFields: Record<string, string> = {};
  let gifts: string[] | undefined;
  let rites: string[] | undefined;
  let contracts: string[] | undefined;
  const powers: Record<string, number> = {};

  if (scaled.werewolf) {
    const w = scaled.werewolf;
    powerStatValue = w.primalUrge ?? 1;
    energyCurrent = w.essence ?? 0;
    if (w.auspice) customFields.auspice = w.auspice;
    if (w.tribe) customFields.tribe = w.tribe;
    if (w.blood) customFields.blood = w.blood;
    if (w.bone) customFields.bone = w.bone;
    if (w.form) customFields.form = w.form;
    if (w.faction) customFields.faction = w.faction;
    if (w.renown) {
      for (const [k, v] of Object.entries(w.renown)) {
        if (typeof v === "number") powers[k] = v;
      }
    }
    if (w.gifts?.length) gifts = [...w.gifts];
    if (w.rites?.length) rites = [...w.rites];
  }

  if (scaled.changeling) {
    const c = scaled.changeling;
    powerStatValue = c.wyrd ?? 1;
    energyCurrent = c.glamour ?? 0;
    if (typeof c.clarity === "number") {
      moralityValue = c.clarity;
    }
    if (c.seeming) customFields.seeming = c.seeming;
    if (c.kith) customFields.kith = c.kith;
    if (c.court) customFields.court = c.court;
    if (c.needle) customFields.needle = c.needle;
    if (c.thread) customFields.thread = c.thread;
    if (c.favoredRegalia?.length) {
      customFields.favored = c.favoredRegalia.join(", ");
    }
    if (c.contracts?.length) contracts = [...c.contracts];
  }

  // Mask/mien prose from flavor (picked earlier) goes on customFields
  // so +shift / look can flip short-desc the same way as PCs.
  if (flavor.mask === null) {
    // hob with no Mask — leave unset
  } else if (typeof flavor.mask === "string" && flavor.mask) {
    customFields.mask = flavor.mask;
  }
  if (typeof flavor.mien === "string" && flavor.mien) {
    customFields.mien = flavor.mien;
  }

  if (scaled.spirit) {
    const s = scaled.spirit;
    customFields.rank = String(s.rank);
    if (s.influence) customFields.influence = s.influence;
    if (s.ban) customFields.ban = s.ban;
    if (s.bane) customFields.bane = s.bane;
  }

  if (scaled.host) {
    customFields.hostType = scaled.host.type;
    if (scaled.host.infestation) {
      customFields.infestation = scaled.host.infestation;
    }
  }

  const npcMeta: NpcSheetNpcMeta = {
    archetype: scaled.slug,
    tier: scaled.tier,
    dreadPowers,
    aiArchetype: aiKey,
    lineage: scaled.lineage,
    ...(lootTable ? { lootTable } : {}),
    ...(scaled.defaults?.presence
      ? { presence: scaled.defaults.presence }
      : {}),
    ...(scaled.defaults?.aggro
      ? { aggro: scaled.defaults.aggro }
      : {}),
    ...(scaled.defaults?.lookMode
      ? { lookMode: scaled.defaults.lookMode }
      : {}),
    ...(ai.startRevealed !== undefined
      ? { startRevealed: ai.startRevealed }
      : {}),
    ...(scaled.defaultWeapon
      ? { defaultWeapon: scaled.defaultWeapon }
      : {}),
    ...(scaled.defaultArmor
      ? { defaultArmor: scaled.defaultArmor }
      : {}),
    ...(flavor.shortDesc ? { shortDesc: flavor.shortDesc } : {}),
    ...(flavor.description
      ? { description: flavor.description }
      : {}),
  };
  if (scaled.changeling) {
    if (flavor.mask === null) npcMeta.mask = null;
    else if (typeof flavor.mask === "string") {
      npcMeta.mask = flavor.mask;
    }
    if (typeof flavor.mien === "string") npcMeta.mien = flavor.mien;
  }

  const sheet: NpcCofdSheet = {
    template: sheetTemplateKey(scaled.lineage),
    concept: `${scaled.name} (NPC)`,
    virtue: "Unknown",
    vice: "Unknown",
    attributes,
    skills: skills as unknown as CofdSheet["skills"],
    specialties,
    merits,
    moralityValue,
    powerStatValue,
    energyCurrent,
    customFields,
    powers,
    ...(gifts ? { gifts } : {}),
    ...(rites ? { rites } : {}),
    ...(contracts ? { contracts } : {}),
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
    npc: npcMeta,
  };

  return sheet;
}

/**
 * Object state fragment for createObj / u.db.create from a built sheet.
 * Applies short-desc attribute, description, presence (dark), etc.
 */
export function objectStateFromSheet(
  sheet: NpcCofdSheet,
  displayName: string,
): {
  name: string;
  flags: string[];
  state: Record<string, unknown>;
} {
  const n = sheet.npc;
  const flags = ["npc", "thing"];
  if (n.presence === "hidden" || n.presence === "ambush") {
    flags.push("dark");
  }

  const attributes: { name: string; value: string }[] = [];
  if (n.shortDesc) {
    attributes.push({ name: "short-desc", value: n.shortDesc });
  }

  // Prefer Mask as room short-desc when lookMode is mask and no shortDesc.
  if (
    !n.shortDesc &&
    typeof n.mask === "string" &&
    (n.lookMode === "mask" || n.lookMode === "auto" || !n.lookMode)
  ) {
    attributes.push({ name: "short-desc", value: n.mask });
  }

  let description = n.description ?? "";
  if (
    n.lookMode === "mien" &&
    typeof n.mien === "string" &&
    n.mien
  ) {
    description = n.mien;
  } else if (
    !description &&
    typeof n.mask === "string"
  ) {
    description = n.mask;
  }

  const state: Record<string, unknown> = {
    name: displayName,
    cofd: sheet,
  };
  if (description) state.description = description;
  if (attributes.length) state.attributes = attributes;

  return { name: displayName, flags, state };
}

/** Health max from template base stats (pre-tier-scale of sheet). */
export function templateHealthMax(t: NpcTemplate): number {
  return t.attributes.stamina + t.size;
}
