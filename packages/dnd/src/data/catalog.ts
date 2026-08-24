/**
 * JSON table loaders for D&D SRD content.
 * Source files: packages/dnd/resources/*.json
 */
import type { DndAbility, DndSkill } from "../stats/dnd_sheet.ts";

import classesJson from "../../resources/classes.json" with {
  type: "json",
};
import backgroundsJson from "../../resources/backgrounds.json" with {
  type: "json",
};
import featsJson from "../../resources/feats.json" with {
  type: "json",
};
import npcsJson from "../../resources/npcs.json" with {
  type: "json",
};
import speciesJson from "../../resources/species.json" with {
  type: "json",
};
import skillsJson from "../../resources/skills.json" with {
  type: "json",
};
import conditionsJson from "../../resources/conditions.json" with {
  type: "json",
};
import spellsJson from "../../resources/spells.json" with {
  type: "json",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentOption {
  label: string;
  items: Array<{ name: string; spec: string }>;
}

export interface EquipmentChoice {
  description: string;
  options: EquipmentOption[];
}

export interface ClassData {
  slug?: string;
  name?: string;
  book?: string;
  hitDie: number;
  saves: DndAbility[];
  skillCount: number;
  skillOptions: DndSkill[];
  spellcasting?: {
    cantripCount: number;
    spellCount: number;
    cantripOptions: string[];
    spellOptions: string[];
  };
  startingGold: number;
  startingEquipmentChoices?: EquipmentChoice[];
}

export interface BackgroundData {
  slug?: string;
  name?: string;
  book?: string;
  skills: DndSkill[];
  fixedIncreases: Record<DndAbility, number>;
  feat: string;
}

export interface FeatEntry {
  slug: string;
  name: string;
  book?: string;
}

export interface SpeciesEntry {
  slug: string;
  name: string;
  book?: string;
}

export interface SkillEntry {
  slug: string;
  name: string;
  book?: string;
}

export interface DropConfig {
  item: string;
  chance: number;
  type: string;
  formula?: string;
}

export interface NpcTemplate {
  slug?: string;
  name?: string;
  book?: string;
  /** Challenge rating string, e.g. "1/4", "2". */
  cr?: string;
  hp: number;
  ac: number;
  xp: number;
  abilities: Record<string, number>;
  drops?: DropConfig[];
  /** Optional known spell slugs for spellcasting NPCs. */
  spells?: string[];
  weapon?: {
    name: string;
    damage: string;
    damageType: string;
    finesse?: boolean;
    ranged?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const CLASS_METADATA: Record<string, ClassData> =
  classesJson as Record<string, ClassData>;

export const BACKGROUND_METADATA: Record<string, BackgroundData> =
  backgroundsJson as Record<string, BackgroundData>;

export const FEATS: readonly FeatEntry[] =
  featsJson as FeatEntry[];

/** Slug list — matches historical ORIGIN_FEATS consumers. */
export const ORIGIN_FEATS: string[] = FEATS.map((f) => f.slug);

export const SPECIES: readonly SpeciesEntry[] =
  speciesJson as SpeciesEntry[];

export const SPECIES_NAMES: string[] = SPECIES.map((s) => s.name);

export const SKILL_ENTRIES: readonly SkillEntry[] =
  skillsJson as SkillEntry[];

export const NPC_TEMPLATES: Record<string, NpcTemplate> =
  npcsJson as Record<string, NpcTemplate>;

export interface ConditionEntry {
  slug: string;
  name: string;
  book?: string;
  effects: string[];
}

export interface SpellEntry {
  slug: string;
  name: string;
  level: number;
  school: string;
  concentration: boolean;
  ritual?: boolean;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  book?: string;
  damage?: string;
  damageType?: string;
  healing?: string;
  /** Grant temp HP (formula or flat, e.g. "1d4+4" or "5"). */
  tempHp?: string;
  attack?: "melee" | "ranged";
  save?: string;
  /** On a successful save, take half damage (default false). */
  halfOnSave?: boolean;
  autoHit?: boolean;
  onFailCondition?: string;
  onCastCondition?: string;
  healingAbility?: string;
}

export const CONDITIONS: readonly ConditionEntry[] =
  conditionsJson as ConditionEntry[];

export const CONDITION_BY_SLUG: Record<string, ConditionEntry> =
  Object.fromEntries(
    CONDITIONS.map((c) => [c.slug, c]),
  );

export const SPELLS: Record<string, SpellEntry> =
  spellsJson as Record<string, SpellEntry>;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function classBySlug(slug: string): ClassData | undefined {
  return CLASS_METADATA[slug.toLowerCase().trim()];
}

export function backgroundBySlug(
  slug: string,
): BackgroundData | undefined {
  return BACKGROUND_METADATA[slug.toLowerCase().trim()];
}

export function npcBySlug(slug: string): NpcTemplate | undefined {
  return NPC_TEMPLATES[slug.toLowerCase().trim()];
}

export function isKnownSpecies(raw: string): boolean {
  const t = raw.toLowerCase().trim();
  return SPECIES.some(
    (s) => s.slug === t || s.name.toLowerCase() === t,
  );
}

export function isOriginFeatSlug(raw: string): boolean {
  const t = raw.toLowerCase().trim().replace(/\s+/g, "_")
    .replace(/[()]/g, "");
  return ORIGIN_FEATS.includes(t) ||
    FEATS.some((f) => f.name.toLowerCase() === raw.toLowerCase());
}

export function conditionBySlug(
  raw: string,
): ConditionEntry | undefined {
  const t = raw.toLowerCase().trim().replace(/\s+/g, "_");
  return CONDITION_BY_SLUG[t] ??
    CONDITIONS.find((c) => c.name.toLowerCase() === raw.toLowerCase());
}

export function spellBySlug(raw: string): SpellEntry | undefined {
  const t = raw.toLowerCase().trim().replace(/\s+/g, "_")
    .replace(/'/g, "");
  return SPELLS[t] ??
    Object.values(SPELLS).find((s) =>
      s.name.toLowerCase() === raw.toLowerCase()
    );
}

/** Spells at a given level (0 = cantrips). */
export function spellsByLevel(level: number): SpellEntry[] {
  return Object.values(SPELLS)
    .filter((s) => s.level === level)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** NPC slugs sorted by CR then name. */
export function listNpcSlugs(): string[] {
  const order = (cr: string): number => {
    if (cr.includes("/")) {
      const [a, b] = cr.split("/").map(Number);
      return a / b;
    }
    return Number(cr) || 0;
  };
  return Object.keys(NPC_TEMPLATES).sort((a, b) => {
    const na = NPC_TEMPLATES[a];
    const nb = NPC_TEMPLATES[b];
    const d = order(na.cr ?? "0") - order(nb.cr ?? "0");
    if (d !== 0) return d;
    return (na.name ?? a).localeCompare(nb.name ?? b);
  });
}
