// CofdSheet interface, default sheet builder, migration, and dynamic advantage refresh.

import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  type CofdAttribute,
  type CofdSkill,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";

/** CoFD 2e health track. Damage cumulates across types up to stamina+size. */
export interface HealthTrack {
  bashing: number;
  lethal: number;
  aggravated: number;
}

/** Runtime instance of an active Condition. Catalog metadata lives elsewhere. */
export interface ConditionInstance {
  key: string;
  /** Optional override or note about this instance of the condition. */
  note?: string;
}

/** Active Aspiration. CoFD 2e characters typically carry up to 3 active. */
export interface Aspiration {
  text: string;
  shortTerm: boolean;
}

/** Runtime instance of an active Tilt (Personal or Environmental). */
export interface TiltInstance {
  key: string;
  note?: string;
}

/**
 * Equipment block on the sheet.
 *
 * The actual items are records in the `cofd.items` DBO collection so they
 * can carry per-instance state (ammo, custom labels, durability later).
 * The sheet only records which item ids occupy the equipped slots. The
 * carried inventory is computed by querying `cofd.items` for
 * `{ ownerId: actorId, location: "inventory" }`.
 */
export interface EquipmentState {
  /** Item id (not catalog key) of the currently-equipped weapon, or null. */
  equippedWeapon: string | null;
  /** Item id (not catalog key) of the currently-equipped armor, or null. */
  equippedArmor: string | null;
}

/**
 * Touchstones anchor a character to their morality track.
 *
 * - `mask`  : Vampire-only -- Daydream / Public Persona anchor.
 * - `dirge` : Vampire-only -- Nightmare / Private Truth anchor.
 * - `list`  : General-purpose touchstones for non-vampire templates.
 */
export interface Touchstones {
  mask?: string;
  dirge?: string;
  list?: string[];
}

export interface CofdSheet {
  template: string;            // e.g. "mortal", "vampire", "changeling"
  concept: string;
  virtue: string;
  vice: string;
  attributes: Record<CofdAttribute, number>;
  skills: Record<CofdSkill, number>;
  specialties: Record<string, string[]>;
  /**
   * Optional per-specialty descriptions, keyed by `skill -> name -> description`.
   * Stored separately from `specialties` so the legacy `Record<string, string[]>`
   * shape stays untouched and old sheets read cleanly. Missing entries are "".
   */
  specialtyDescriptions?: Record<string, Record<string, string>>;
  merits: Record<string, number>;       // e.g. { giant: 4, "iron stomach": 2 }
  moralityValue: number;       // e.g. Integrity, Humanity, Clarity, Wisdom
  powerStatValue: number;      // e.g. Blood Potency, Wyrd, Gnosis
  energyCurrent: number;       // e.g. Vitae, Glamour, Mana
  customFields: Record<string, string>; // e.g. { clan: "Daeva", covenant: "Invictus" }
  powers: Record<string, number>;       // e.g. { vigor: 3, resilience: 2 }
  /** Discrete supernatural picks selected by name (e.g. Werewolf Gift facets). */
  gifts?: string[];
  /** Discrete ritual picks selected by name (e.g. Werewolf Rites). */
  rites?: string[];
  /** Discrete Contract picks selected by name (Changeling: The Lost). */
  contracts?: string[];
  advantages: {
    willpowerMax: number;
    willpowerCurrent: number;
    size: number;
  };

  // ---------------------------------------------------------------------------
  // Optional fields below are reserved for upcoming subsystems. They are
  // intentionally optional so that existing saved sheets remain valid; the
  // section renderers and subsystem commands fill them in over time.
  // ---------------------------------------------------------------------------

  /** Health track (M2 -- Health/Damage). Empty struct if uninitialized. */
  health?: HealthTrack;
  /** Active Conditions by catalog key (M5 -- Conditions/Aspirations). */
  conditions?: ConditionInstance[];
  /** Active Aspirations, capped at 3 in normal play (M5). */
  aspirations?: Aspiration[];
  /** Beat counter. Converts at 5 -> 1 Experience (M4 -- Beats/XP). */
  beats?: number;
  /** Banked standard Experience points (M4). */
  experience?: number;
  /** Arcane Beat counter for supernatural templates (M4). */
  arcaneBeats?: number;
  /** Banked Arcane Experience points (M4). */
  arcaneExperience?: number;
  /** Touchstones (M6 -- Vampire Mask/Dirge; also general-use). */
  touchstones?: Touchstones;
  /**
   * Temporary stat overrides keyed by stat name (lowercase). Used to render
   * the sheet as `Base(Temp)` when a scene-bound buff is active
   * (Vitae boost, Willpower-spend specialty, etc.). Renderer only shows the
   * parenthetical when the value differs from the base trait.
   */
  tempStats?: Record<string, number>;
  /** Active Tilts. Personal + environmental are both stored here. */
  tilts?: TiltInstance[];
  /** Carried gear, equipped weapon, equipped armor. */
  equipment?: EquipmentState;
}

/** Builds a fresh, empty `EquipmentState`. */
function emptyEquipment(): EquipmentState {
  return { equippedWeapon: null, equippedArmor: null };
}

/** Builds a fresh, empty `HealthTrack`. */
function emptyHealth(): HealthTrack {
  return { bashing: 0, lethal: 0, aggravated: 0 };
}

/**
 * Migrates older sheets to the new template-driven structure safely with zero data loss.
 */
// deno-lint-ignore no-explicit-any
export function migrateSheet(sheet: any): CofdSheet {
  const template = sheet.template || "mortal";
  const moralityValue = typeof sheet.moralityValue === "number"
    ? sheet.moralityValue
    : (sheet.advantages?.integrity ?? 7);
  const powerStatValue = typeof sheet.powerStatValue === "number" ? sheet.powerStatValue : 0;
  const energyCurrent = typeof sheet.energyCurrent === "number" ? sheet.energyCurrent : 0;
  const customFields = sheet.customFields || {};
  const powers = sheet.powers || {};
  const merits = sheet.merits || {};

  // Defaults for new optional subsystem fields. Preserve any existing values.
  const health: HealthTrack = sheet.health && typeof sheet.health === "object"
    ? {
      bashing: sheet.health.bashing ?? 0,
      lethal: sheet.health.lethal ?? 0,
      aggravated: sheet.health.aggravated ?? 0,
    }
    : emptyHealth();
  const conditions: ConditionInstance[] = Array.isArray(sheet.conditions)
    ? sheet.conditions
    : [];
  const aspirations: Aspiration[] = Array.isArray(sheet.aspirations)
    ? sheet.aspirations
    : [];
  const beats = typeof sheet.beats === "number" ? sheet.beats : 0;
  const experience = typeof sheet.experience === "number" ? sheet.experience : 0;
  const arcaneBeats = typeof sheet.arcaneBeats === "number" ? sheet.arcaneBeats : 0;
  const arcaneExperience = typeof sheet.arcaneExperience === "number"
    ? sheet.arcaneExperience
    : 0;
  const touchstones: Touchstones = sheet.touchstones && typeof sheet.touchstones === "object"
    ? sheet.touchstones
    : {};
  const tempStats: Record<string, number> = sheet.tempStats && typeof sheet.tempStats === "object"
    ? sheet.tempStats
    : {};
  const tilts: TiltInstance[] = Array.isArray(sheet.tilts) ? sheet.tilts : [];
  // Specialty descriptions: optional sibling map, never overwrites the legacy
  // string[] shape. Missing entries render as no description.
  const specialtyDescriptions: Record<string, Record<string, string>> =
    sheet.specialtyDescriptions && typeof sheet.specialtyDescriptions === "object"
      ? sheet.specialtyDescriptions
      : {};
  // Migration: any pre-DBO embedded items[] on the sheet are dropped. The
  // gear refactor moves items to a dedicated DBO collection; pre-existing
  // sheets with embedded items would need a separate migrator (not in
  // scope -- the plugin has no production data).
  const equipment: EquipmentState = sheet.equipment && typeof sheet.equipment === "object"
    ? {
      equippedWeapon: sheet.equipment.equippedWeapon ?? null,
      equippedArmor: sheet.equipment.equippedArmor ?? null,
    }
    : emptyEquipment();

  return {
    ...sheet,
    template,
    moralityValue,
    powerStatValue,
    energyCurrent,
    customFields,
    powers,
    merits,
    advantages: {
      willpowerMax: sheet.advantages?.willpowerMax ?? 2,
      willpowerCurrent: sheet.advantages?.willpowerCurrent ?? 2,
      size: sheet.advantages?.size ?? 5,
    },
    health,
    conditions,
    aspirations,
    beats,
    experience,
    arcaneBeats,
    arcaneExperience,
    touchstones,
    tempStats,
    tilts,
    equipment,
    specialtyDescriptions,
  };
}

/**
 * Returns a new default empty character sheet.
 */
export function defaultSheet(): CofdSheet {
  const attributes = {} as Record<CofdAttribute, number>;
  for (const attr of COFD_ATTRIBUTES) {
    attributes[attr] = 1;
  }

  const skills = {} as Record<CofdSkill, number>;
  for (const skill of COFD_SKILLS) {
    skills[skill] = 0;
  }

  return {
    template: "mortal",
    concept: "Unknown",
    virtue: "Unknown",
    vice: "Unknown",
    attributes,
    skills,
    specialties: {},
    merits: {},
    moralityValue: 7,
    powerStatValue: 0,
    energyCurrent: 0,
    customFields: {},
    powers: {},
    advantages: {
      willpowerMax: 2, // Resolve(1) + Composure(1)
      willpowerCurrent: 2,
      size: 5,
    },
    health: emptyHealth(),
    conditions: [],
    aspirations: [],
    beats: 0,
    experience: 0,
    arcaneBeats: 0,
    arcaneExperience: 0,
    touchstones: {},
    tempStats: {},
    tilts: [],
    equipment: emptyEquipment(),
    specialtyDescriptions: {},
  };
}

/**
 * Recalculates dynamic advantages (like Max Willpower) based on Attributes and Templates.
 */
export function refreshAdvantages(sheet: CofdSheet): CofdSheet {
  sheet = migrateSheet(sheet);
  const resolve = sheet.attributes.resolve || 1;
  const composure = sheet.attributes.composure || 1;
  const oldMax = sheet.advantages.willpowerMax;
  const newMax = resolve + composure;

  sheet.advantages.willpowerMax = newMax;
  if (oldMax !== newMax) {
    sheet.advantages.willpowerCurrent = Math.min(sheet.advantages.willpowerCurrent, newMax);
  }

  // Clamp energy pool to maximum allowed by current template & powerStatValue
  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;
  const maxEnergy = tmpl.energyMaxFormula(sheet.powerStatValue);
  sheet.energyCurrent = Math.min(sheet.energyCurrent, maxEnergy);

  // Health track scaffolding: ensure the struct exists for downstream M2 work.
  // We do not apply damage semantics here -- that's M2's job. We only guarantee
  // the field is present and, if set, clamp the total to stamina+size.
  if (!sheet.health) {
    sheet.health = emptyHealth();
  } else {
    const maxHealth = (sheet.attributes.stamina || 1) + sheet.advantages.size;
    const total = sheet.health.bashing + sheet.health.lethal + sheet.health.aggravated;
    if (total > maxHealth) {
      // Trim from the least-severe bucket first (bashing -> lethal -> aggravated).
      let overflow = total - maxHealth;
      const trim = (n: number) => {
        const take = Math.min(n, overflow);
        overflow -= take;
        return n - take;
      };
      sheet.health.bashing = trim(sheet.health.bashing);
      sheet.health.lethal = trim(sheet.health.lethal);
      sheet.health.aggravated = trim(sheet.health.aggravated);
    }
  }

  return sheet;
}
