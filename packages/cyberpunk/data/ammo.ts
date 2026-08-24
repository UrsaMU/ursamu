/**
 * Cyberpunk RED — Ammunition Types
 *
 * Pure data + pure functions. The combat engine should call these helpers to
 * modify damage/armor resolution based on the loaded ammo type. None of these
 * functions touch the DB or game state.
 *
 * Sources: CPR Core p.344-347 + errata p.345-347.
 *
 * Hook points for engine/combat.ts (do NOT inline these — call the helpers):
 *   - effectiveSpForAmmo(type, sp, armorTier)  : modifies SP before reduction.
 *   - finalDamageForAmmo(type, raw, armorTier) : modifies damage before SP.
 *   - onHitEffects(type)                       : returns [{ name, payload }].
 *   - canHarmTarget(type, armorTier)           : false => no damage applied.
 *   - isNonLethal(type)                        : true => stun, not HP.
 */

import type { WeaponType } from "./weapons.ts";

export type AmmoType =
  | "basic"
  | "armor_piercing"
  | "expansive"
  | "incendiary"
  | "rubber"
  | "smoke"
  | "smart"
  | "biotoxin"
  | "poison"
  | "emp"
  | "sleep";

export type ArmorTier = "none" | "light" | "medium" | "heavy" | "metal";

export interface IAmmoDef {
  id: AmmoType;
  label: string;
  /** Per-10-rounds cost in eb. Grenades/rockets billed per round elsewhere. */
  costEb: number;
  /** Weapon types this ammo can be loaded into. */
  weaponTypes: WeaponType[];
  /** Short single-line description. */
  description: string;
  /** Marks ammo whose default for the carrier is AP (grenades/rockets). */
  defaultForExplosives?: boolean;
}

/** Light/Medium armor tiers per CPR Core armor table. */
const LIGHT_OR_MEDIUM: ArmorTier[] = ["light", "medium"];

export const AMMO: IAmmoDef[] = [
  {
    id: "basic",
    label: "Basic",
    costEb: 10,
    weaponTypes: ["pistol", "smg", "shotgun", "rifle", "sniper", "bow"],
    description: "Standard rounds. No special effect.",
  },
  {
    id: "armor_piercing",
    label: "Armor-Piercing",
    costEb: 100,
    weaponTypes: ["pistol", "smg", "shotgun", "rifle", "sniper", "grenade", "explosive"],
    description: "Halves SP. Halves damage vs. Light/Medium armor (errata).",
    defaultForExplosives: true,
  },
  {
    id: "expansive",
    label: "Expansive",
    costEb: 100,
    weaponTypes: ["pistol", "smg", "shotgun", "rifle", "sniper"],
    description: "x2 damage vs. unarmored targets. Cannot harm armored targets.",
  },
  {
    id: "incendiary",
    label: "Incendiary",
    costEb: 100,
    weaponTypes: ["pistol", "smg", "shotgun", "rifle", "sniper"],
    description: "Inflicts 1 ongoing burn damage on hit (errata: slugs allowed).",
  },
  {
    id: "rubber",
    label: "Rubber",
    costEb: 10,
    weaponTypes: ["pistol", "smg", "shotgun", "rifle", "sniper", "exotic"],
    description: "Non-lethal. Damage becomes stun (errata: counts as Basic for Exotic).",
  },
  {
    id: "smoke",
    label: "Smoke",
    costEb: 50,
    weaponTypes: ["shotgun", "grenade"],
    description: "No damage. 10m x 10m smoke for 1 min; -4 to tasks inside.",
  },
  {
    id: "smart",
    label: "Smart",
    costEb: 100,
    weaponTypes: ["pistol", "smg", "shotgun", "rifle", "sniper"],
    description: "Homing. Requires a Smartgun Link cyberware (errata: slugs allowed).",
  },
  {
    id: "biotoxin",
    label: "Biotoxin",
    costEb: 100,
    weaponTypes: ["grenade"],
    description: "Poisons everyone in the area. DV15 RES check or take damage.",
  },
  {
    id: "poison",
    label: "Poison",
    costEb: 100,
    weaponTypes: ["bow", "exotic"],
    description: "Inflicts Poisoned status on hit. DV13 RES check to resist.",
  },
  {
    id: "emp",
    label: "EMP",
    costEb: 100,
    weaponTypes: ["grenade"],
    description: "Disables electronics & cyberware in area for 1d6 rounds.",
  },
  {
    id: "sleep",
    label: "Sleep",
    costEb: 100,
    weaponTypes: ["grenade", "exotic"],
    description: "DV15 RES or fall asleep for 1 minute.",
  },
];

export const getAmmo = (id: string): IAmmoDef | undefined =>
  AMMO.find((a) => a.id === id.toLowerCase().replace(/[\s\-]/g, "_"));

export const ammoForWeaponType = (t: WeaponType): IAmmoDef[] =>
  AMMO.filter((a) => a.weaponTypes.includes(t));

/** True if the weapon type uses AP as its default loaded ammo (errata p.345). */
export const defaultAmmoForWeaponType = (t: WeaponType): AmmoType =>
  (t === "grenade" || t === "explosive") ? "armor_piercing" : "basic";

// ─── Pure resolution helpers (combat engine hooks) ──────────────────────────

/**
 * Adjust SP before reduction, given the loaded ammo type.
 * - AP halves SP (round down).
 * - All other ammo types leave SP unchanged.
 */
export const effectiveSpForAmmo = (type: AmmoType, sp: number): number => {
  if (type === "armor_piercing") return Math.floor(sp / 2);
  return sp;
};

/**
 * Adjust raw damage based on ammo + the *defender's* armor tier worn.
 * - AP: vs. Light/Medium armor, raw damage is halved (round down). Errata p.345.
 * - Expansive: vs. unarmored, raw damage x2.
 * - All others unchanged here. Other effects fire from onHitEffects().
 */
export const finalDamageForAmmo = (
  type: AmmoType,
  rawDamage: number,
  armorTier: ArmorTier,
): number => {
  if (type === "armor_piercing" && LIGHT_OR_MEDIUM.includes(armorTier)) {
    return Math.floor(rawDamage / 2);
  }
  if (type === "expansive" && armorTier === "none") return rawDamage * 2;
  return rawDamage;
};

/**
 * Whether a hit can damage the target at all.
 * Expansive ammo cannot harm an armored target.
 */
export const canHarmTarget = (type: AmmoType, armorTier: ArmorTier): boolean => {
  if (type === "expansive" && armorTier !== "none") return false;
  return true;
};

/** True if ammo damage is non-lethal (stun-equivalent). */
export const isNonLethal = (type: AmmoType): boolean => type === "rubber";

/** Side-effects to apply on a successful hit. The engine should react to these. */
export interface IAmmoEffect {
  effect:
    | "burn"        // ongoing 1 damage per turn
    | "poison"      // DV13 RES or poisoned
    | "stun"        // damage routes to stun pool
    | "emp"         // disables electronics 1d6 rounds
    | "sleep"       // DV15 RES or sleep 1 min
    | "biotoxin"    // DV15 RES or take damage in area
    | "smoke";      // creates smoke area
  duration?: number;
  dv?: number;
}

export const onHitEffects = (type: AmmoType): IAmmoEffect[] => {
  switch (type) {
    case "incendiary": return [{ effect: "burn", duration: -1 }];
    case "rubber":     return [{ effect: "stun" }];
    case "poison":     return [{ effect: "poison", dv: 13 }];
    case "emp":        return [{ effect: "emp" }];
    case "sleep":      return [{ effect: "sleep", dv: 15 }];
    case "biotoxin":   return [{ effect: "biotoxin", dv: 15 }];
    case "smoke":      return [{ effect: "smoke", duration: 6 }];
    default: return [];
  }
};

/** True if a Smartgun Link cyberware is required for this ammo to work. */
export const requiresSmartgunLink = (type: AmmoType): boolean => type === "smart";
