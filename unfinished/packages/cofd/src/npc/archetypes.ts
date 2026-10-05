// NPC archetype registry — compatibility layer over the JSON catalog.
// Author templates live in resources/npcs/*.json (see schemas/npc.schema.json).
//
// Tiers (CoFD 2e Antagonist guidance):
//   minor       - mooks / extras. One trait pool, no merits, max 1 power.
//   major       - named antagonist. Skill specialties, merits, several powers.
//   storyteller - PC-equivalent. Full chargen array, complex powers.

import type { CofdSheet } from "../stats/sheet.ts";
import {
  getNpcTemplate,
  listNpcTemplates,
  npcTemplateKeys,
} from "./catalog.ts";
import {
  objectStateFromSheet,
  sheetFromTemplate,
  templateHealthMax,
  tierMeritCap,
  tierPowerCap,
  type NpcCofdSheet,
  type SheetFromTemplateOpts,
} from "./sheet_from_template.ts";
import type { NpcTemplate, NpcTier } from "./types.ts";

export type { NpcTier };
export {
  objectStateFromSheet,
  sheetFromTemplate,
  templateHealthMax,
  tierMeritCap,
  tierPowerCap,
};
export type { NpcCofdSheet, SheetFromTemplateOpts };

/** Legacy shape still used by some tests and list UIs. */
export interface NpcArchetype {
  key: string;
  label: string;
  blurb: string;
  tier: NpcTier;
  attributes: {
    intelligence: number;
    wits: number;
    resolve: number;
    strength: number;
    dexterity: number;
    stamina: number;
    presence: number;
    manipulation: number;
    composure: number;
  };
  skills: Record<string, number>;
  merits?: Record<string, number>;
  specialties?: Record<string, string[]>;
  dreadPowers?: string[];
  integrity: number;
  size: number;
  defaultWeapon?: string;
}

/** Map JSON template → legacy NpcArchetype view. */
export function templateToArchetype(t: NpcTemplate): NpcArchetype {
  return {
    key: t.slug,
    label: t.name,
    blurb: t.blurb ?? t.name,
    tier: t.tier,
    attributes: { ...t.attributes },
    skills: { ...t.skills },
    ...(t.merits ? { merits: { ...t.merits } } : {}),
    ...(t.specialties
      ? { specialties: { ...t.specialties } }
      : {}),
    ...(t.dreadPowers
      ? { dreadPowers: [...t.dreadPowers] }
      : {}),
    integrity: t.integrity,
    // CoD default Size is 5 (adult human) when the template omits it.
    size: t.size ?? 5,
    ...(t.defaultWeapon
      ? { defaultWeapon: t.defaultWeapon }
      : {}),
  };
}

/**
 * Lowercased registry built from the JSON catalog (and kept for callers
 * that still index NPC_ARCHETYPES[key]).
 */
export const NPC_ARCHETYPES: Record<string, NpcArchetype> =
  Object.fromEntries(
    listNpcTemplates().map((t) => [
      t.slug,
      templateToArchetype(t),
    ]),
  );

/** Return the archetype by key (case-insensitive), or null. */
export function getArchetype(key: string): NpcArchetype | null {
  const t = getNpcTemplate(key);
  return t ? templateToArchetype(t) : null;
}

/** Stable list of archetype keys (for /list output). */
export function archetypeKeys(): string[] {
  return npcTemplateKeys();
}

/** All valid tier strings, in order from weakest to strongest. */
export const NPC_TIERS: readonly NpcTier[] = [
  "minor",
  "major",
  "storyteller",
];

/**
 * Build a CofdSheet from a legacy NpcArchetype or (preferred) resolve
 * the live template by key when possible.
 */
export function sheetFromArchetype(
  a: NpcArchetype,
  tier?: NpcTier,
  opts: SheetFromTemplateOpts = {},
): NpcCofdSheet {
  const t = getNpcTemplate(a.key);
  if (t) return sheetFromTemplate(t, tier, opts);

  // Fallback: synthesize a minimal template from the legacy object.
  const synth: NpcTemplate = {
    slug: a.key,
    name: a.label,
    blurb: a.blurb,
    tier: a.tier,
    lineage: "mortal",
    attributes: a.attributes,
    skills: a.skills,
    merits: a.merits,
    specialties: a.specialties,
    dreadPowers: a.dreadPowers,
    integrity: a.integrity,
    size: a.size,
    defaultWeapon: a.defaultWeapon,
  };
  return sheetFromTemplate(synth, tier, opts);
}

/** Compute health max for an archetype (stamina + size). */
export function archetypeHealthMax(a: NpcArchetype): number {
  return a.attributes.stamina + a.size;
}

/** Compute Defense = lower of Dex/Wits + Athletics for a sheet. */
export function sheetDefense(sheet: CofdSheet): number {
  const dex = sheet.attributes.dexterity ?? 0;
  const wits = sheet.attributes.wits ?? 0;
  const ath =
    (sheet.skills as Record<string, number>)["athletics"] ?? 0;
  return Math.min(dex, wits) + ath;
}

/** Initiative modifier = Dex + Composure. */
export function sheetInitiative(sheet: CofdSheet): number {
  return (sheet.attributes.dexterity ?? 0) +
    (sheet.attributes.composure ?? 0);
}

/** Speed = Strength + Dexterity + Size. */
export function sheetSpeed(sheet: CofdSheet): number {
  return (sheet.attributes.strength ?? 0) +
    (sheet.attributes.dexterity ?? 0) +
    (sheet.advantages?.size ?? 5);
}

/** Health max = Stamina + Size. */
export function sheetHealthMax(sheet: CofdSheet): number {
  return (sheet.attributes.stamina ?? 0) +
    (sheet.advantages?.size ?? 5);
}
