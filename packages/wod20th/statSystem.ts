// statSystem.ts -- IStatSystem implementation for wod20th.
// Registers with the UrsaMU engine so other plugins (jobs, admin tools) can
// read/write wod20th character stats without importing chargen internals.

import { ALL_ATTRIBUTES, ALL_ABILITIES } from "./core/attributes.ts";
import type { IWoDChar } from "./core/types.ts";
import { findByPlayer, saveChar } from "./db/charDb.ts";

// IStatSystem contract consumed by the engine's chargen / sheet commands.
// Defined locally: the engine exposes registerStatSystem() as an optional
// extension, so the interface mirrors ai-gm's shape without importing it.
export interface IStatSystem {
  name: string;
  version: string;
  getCategories(): string[];
  getStats(category?: string): string[];
  getStat(actor: Record<string, unknown>, stat: string): unknown;
  setStat(
    actor: Record<string, unknown>,
    stat: string,
    value: unknown,
  ): Promise<void>;
  validate(stat: string, value: unknown): boolean | string;
}

// -- Category -> stat name map ----------------------------------------------

const CATEGORIES: Record<string, readonly string[]> = {
  Attributes:  ALL_ATTRIBUTES,
  Abilities:   ALL_ABILITIES,
  Advantages:  [
    "Allies", "Ancestors", "Contacts", "Fetish", "Kinfolk",
    "Mentor", "Pure Breed", "Resources", "Rites", "Spirit Heritage", "Totem",
  ],
  Pools:       ["Rage", "Gnosis", "Willpower"],
  Renown:      ["Glory", "Honor", "Wisdom"],
};

const ALL_STAT_NAMES: readonly string[] = Object.values(CATEGORIES).flat();

// Pool traits that go up to 10; everything else caps at 5.
const POOL_TRAITS = new Set(["Rage", "Gnosis", "Willpower"]);

// -- Helpers ---------------------------------------------------------------

/** Return the dotted path inside actor["data"] where this stat lives. */
function statPath(stat: string): { section: string; key: string } | null {
  const lower = stat.toLowerCase();
  const attr = ALL_ATTRIBUTES.find((a) => a.toLowerCase() === lower);
  if (attr) return { section: "attributes", key: attr };

  const abil = ALL_ABILITIES.find((a) => a.toLowerCase() === lower);
  if (abil) return { section: "abilities", key: abil };

  const pool = CATEGORIES.Pools.find((p) => p.toLowerCase() === lower);
  if (pool) return { section: "pools", key: pool.toLowerCase() };

  const renown = CATEGORIES.Renown.find((r) => r.toLowerCase() === lower);
  if (renown) return { section: "renown", key: renown.toLowerCase() };

  // Background / Advantage
  const bg = CATEGORIES.Advantages.find((b) => b.toLowerCase() === lower);
  if (bg) return { section: "backgrounds", key: bg };

  return null;
}

/** Read the IWoDChar sheet from actor["data"]. */
function sheet(actor: Record<string, unknown>): IWoDChar | null {
  const data = actor["data"] as Record<string, unknown> | undefined;
  if (!data) return null;
  return (data["wod20th"] ?? data) as IWoDChar;
}

// -- IStatSystem implementation --------------------------------------------

export const wod20thStatSystem: IStatSystem = {
  name: "wod20th",
  version: "1.0.0",

  getCategories(): string[] {
    return Object.keys(CATEGORIES);
  },

  getStats(category?: string): string[] {
    if (!category) return ALL_STAT_NAMES as string[];
    const cat = Object.keys(CATEGORIES).find(
      (c) => c.toLowerCase() === category.toLowerCase(),
    );
    return cat ? (CATEGORIES[cat] as string[]) : [];
  },

  // deno-lint-ignore no-explicit-any
  getStat(actor: Record<string, unknown>, stat: string): any {
    const char = sheet(actor);
    if (!char) return undefined;

    const lower = stat.toLowerCase();

    // Attributes
    const attr = ALL_ATTRIBUTES.find((a) => a.toLowerCase() === lower);
    if (attr) return (char.attributes?.[attr] ?? 0) + 1; // base 1 + extra dots

    // Abilities
    const abil = ALL_ABILITIES.find((a) => a.toLowerCase() === lower);
    if (abil) return char.abilities?.[abil] ?? 0;

    // Pools
    if (lower === "rage")      return char.rage ?? 0;
    if (lower === "gnosis")    return char.gnosis ?? 0;
    if (lower === "willpower") return char.willpower ?? 0;

    // Renown
    if (lower === "glory")   return char.renown?.glory ?? 0;
    if (lower === "honor")   return char.renown?.honor ?? 0;
    if (lower === "wisdom")  return char.renown?.wisdom ?? 0;

    // Backgrounds
    const bgKey = CATEGORIES.Advantages.find(
      (b) => b.toLowerCase() === lower,
    );
    if (bgKey) return char.backgrounds?.[bgKey] ?? 0;

    return undefined;
  },

  async setStat(
    actor: Record<string, unknown>,
    stat: string,
    value: unknown,
  ): Promise<void> {
    const path = statPath(stat);
    if (!path) return;

    const objId = actor["id"] as string | undefined;
    if (!objId) return;

    const char = await findByPlayer(objId);
    if (!char) return;

    const lower = stat.toLowerCase();

    // Apply the stat to the appropriate field on the WoD char record.
    if (path.section === "attributes") {
      (char.attributes ??= {})[path.key] = value as number;
    } else if (path.section === "abilities") {
      (char.abilities ??= {})[path.key] = value as number;
    } else if (path.section === "pools") {
      if (lower === "rage")      char.rage      = value as number;
      else if (lower === "gnosis")    char.gnosis    = value as number;
      else if (lower === "willpower") char.willpower = value as number;
    } else if (path.section === "renown") {
      type Renown = NonNullable<IWoDChar["renown"]>;
      if (!char.renown) char.renown = { glory: 0, honor: 0, wisdom: 0 };
      (char.renown as Renown)[path.key as keyof Renown] = value as number;
    } else if (path.section === "backgrounds") {
      (char.backgrounds ??= {})[path.key] = value as number;
    }

    await saveChar(char);
  },

  validate(stat: string, value: unknown): boolean | string {
    if (typeof value !== "number") {
      return `${stat} must be a number.`;
    }
    if (!Number.isInteger(value) || value < 0) {
      return `${stat} must be a non-negative integer.`;
    }
    const key = stat.charAt(0).toUpperCase() + stat.slice(1).toLowerCase();
    const upper = POOL_TRAITS.has(key) ? 10 : 5;
    if (value > upper) {
      return `${stat} cannot exceed ${upper}.`;
    }
    return true;
  },
};
