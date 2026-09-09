// core/battleScars.ts -- W20 battle scar table + roll helper.
//
// A Garou who survives Aggravated damage that fills the Incap slot
// (or A overflow they survive) rolls on this table. Scars are
// permanent (regen does NOT heal them) and confer Glory for bearing
// them. Source: WtA W20 p.297.

import type { IBattleScar } from "./types.ts";

export interface IBattleScarDef {
  slug: string;
  name: string;
  glory: number;
  description: string;
}

export const BATTLE_SCARS: Record<string, IBattleScarDef> = {
  "superficial-scars": {
    slug: "superficial-scars", name: "Superficial Scars", glory: 1,
    description: "Visible scarring across face or body; cosmetic only.",
  },
  "deep-scar": {
    slug: "deep-scar", name: "Deep Scar", glory: 1,
    description: "A single deep scar that aches in cold weather.",
  },
  "improper-bone-setting": {
    slug: "improper-bone-setting", name: "Improper Bone Setting", glory: 1,
    description: "A limb healed crooked; -1 die to one Dexterity pool.",
  },
  "broken-jaw": {
    slug: "broken-jaw", name: "Broken Jaw", glory: 1,
    description: "Jaw never quite healed; -1 die to Social rolls involving speech.",
  },
  "collapsed-lung": {
    slug: "collapsed-lung", name: "Collapsed Lung", glory: 1,
    description: "Reduced Stamina for endurance tasks; -1 die to extended Stamina rolls.",
  },
  "cosmetic-damage": {
    slug: "cosmetic-damage", name: "Cosmetic Damage", glory: 2,
    description: "Disfiguring; -1 die to Appearance-based Social rolls (Garou see Glory).",
  },
  "missing-eye": {
    slug: "missing-eye", name: "Missing Eye", glory: 2,
    description: "One eye gone; -2 dice to ranged attacks and depth-perception rolls.",
  },
  "missing-fingers": {
    slug: "missing-fingers", name: "Missing Fingers", glory: 2,
    description: "Fingers lost from one hand; -1 die to fine-manipulation Dex rolls.",
  },
  "spinal-damage": {
    slug: "spinal-damage", name: "Spinal Damage", glory: 2,
    description: "Chronic pain; Dexterity capped at 4 in homid form.",
  },
  "brain-damage": {
    slug: "brain-damage", name: "Brain Damage", glory: 2,
    description: "Head trauma; -1 die to one Mental Attribute pool (ST picks).",
  },
  "missing-limb": {
    slug: "missing-limb", name: "Missing Limb", glory: 3,
    description: "An arm or leg gone; severe penalty to physical actions involving it.",
  },
  "maimed": {
    slug: "maimed", name: "Maimed", glory: 3,
    description: "Multiple lasting injuries; -1 die to all Physical pools in homid.",
  },
};

const SCARS_LIST: IBattleScarDef[] = Object.values(BATTLE_SCARS);

/** Lookup with own-property guard. */
export function getScar(slug: string): IBattleScarDef | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(BATTLE_SCARS, key)) return undefined;
  return BATTLE_SCARS[key];
}

export function allScars(): IBattleScarDef[] {
  return SCARS_LIST.slice();
}

/**
 * Roll a random scar from the table. Pass a deterministic RNG
 * for tests; defaults to Math.random.
 */
export function rollBattleScar(
  rng: () => number = Math.random,
  cause?: string,
): IBattleScar {
  const idx = Math.min(SCARS_LIST.length - 1, Math.floor(rng() * SCARS_LIST.length));
  const def = SCARS_LIST[idx];
  return {
    slug: def.slug,
    name: def.name,
    glory: def.glory,
    description: def.description,
    acquiredAt: Date.now(),
    ...(cause ? { cause } : {}),
  };
}
