// NPC template types — mirror resources/schemas/npc.schema.json.
// Authorable JSON under resources/npcs/*.json loads into NpcTemplate.

/** Antagonist power tier (CoFD 2e guidance). */
export type NpcTier = "minor" | "major" | "storyteller";

/** Supernatural / mortal family. */
export type NpcLineage =
  | "mortal"
  | "spirit"
  | "ghost"
  | "host"
  | "werewolf"
  | "claimed"
  | "changeling"
  | "hobgoblin"
  | "huntsman"
  | "fetch"
  | "true-fae"
  | "other";

export type MobAggro = "passive" | "territorial" | "hunter";
export type NpcPresence = "visible" | "hidden" | "ambush";
export type NpcLookMode = "mask" | "mien" | "auto";
export type WerewolfForm =
  | "hishu"
  | "dalu"
  | "gauru"
  | "urshul"
  | "urhan";
export type WerewolfFaction =
  | "forsaken"
  | "pure"
  | "ghost-wolves"
  | "other";

export interface NpcAttributes {
  intelligence: number;
  wits: number;
  resolve: number;
  strength: number;
  dexterity: number;
  stamina: number;
  presence: number;
  manipulation: number;
  composure: number;
}

export interface NpcAiConfig {
  archetype: string;
  startRevealed?: boolean;
  preferMelee?: boolean;
  fleeAtHealth?: number;
  params?: Record<string, unknown>;
}

export interface NpcDefaults {
  aggro?: MobAggro;
  presence?: NpcPresence;
  lookMode?: NpcLookMode;
  lootTable?: string;
  wanderRange?: number;
}

export interface WerewolfBlock {
  auspice?: string;
  tribe?: string;
  faction?: WerewolfFaction;
  form?: WerewolfForm;
  primalUrge?: number;
  essence?: number;
  renown?: {
    cunning?: number;
    glory?: number;
    honor?: number;
    purity?: number;
    wisdom?: number;
  };
  gifts?: string[];
  rites?: string[];
  blood?: string;
  bone?: string;
}

/**
 * Flavor prose: one line, or several options. At spawn, arrays are
 * resolved with pickFlavor() so each instance can look different.
 */
export type FlavorText = string | string[];

/**
 * Like FlavorText, but null is allowed (e.g. hob with no Mask).
 */
export type FlavorTextOrNull = string | string[] | null;

export interface ChangelingBlock {
  seeming?: string;
  kith?: string;
  court?: string;
  wyrd?: number;
  glamour?: number;
  clarity?: number;
  contracts?: string[];
  favoredRegalia?: string[];
  needle?: string;
  thread?: string;
  /** Mortal guise; null = none. Array = random at spawn. */
  mask?: FlavorTextOrNull;
  /** True face; array = random at spawn. */
  mien?: FlavorText;
}

export interface SpiritBlock {
  rank: number;
  influence?: string;
  ban?: string;
  bane?: string;
  numina?: string[];
}

export interface HostBlock {
  type: "azlu" | "beshilu" | "other";
  infestation?: string;
}

/**
 * Full authorable NPC template (one JSON file).
 * Validated against resources/schemas/npc.schema.json.
 */
export interface NpcTemplate {
  $schema?: string;
  slug: string;
  name: string;
  blurb?: string;
  book?: string;
  tier: NpcTier;
  lineage: NpcLineage;
  tags?: string[];
  attributes: NpcAttributes;
  skills: Record<string, number>;
  merits?: Record<string, number>;
  specialties?: Record<string, string[]>;
  dreadPowers?: string[];
  integrity: number;
  size: number;
  defaultWeapon?: string;
  defaultArmor?: string;
  /** Room short-desc; array = random pick at spawn. */
  shortDesc?: FlavorText;
  /** Full look; array = random pick at spawn. */
  description?: FlavorText;
  ai?: string | NpcAiConfig;
  defaults?: NpcDefaults;
  werewolf?: WerewolfBlock;
  changeling?: ChangelingBlock;
  spirit?: SpiritBlock;
  host?: HostBlock;
}

/** Normalize ai field to a config object. */
export function resolveAiConfig(
  ai: NpcTemplate["ai"],
): NpcAiConfig {
  if (!ai) return { archetype: "beshilu-swarmer" };
  if (typeof ai === "string") return { archetype: ai };
  return ai;
}

/**
 * Resolve flavor text for a spawned instance.
 * - undefined / empty array → undefined
 * - null → null (explicit "none", e.g. no Mask)
 * - string → that string
 * - string[] → one random non-empty entry
 */
export function pickFlavor(
  value: FlavorText | FlavorTextOrNull | undefined,
  rng: () => number = Math.random,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    return s.length > 0 ? s : undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const opts = value
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (opts.length === 0) return undefined;
  if (opts.length === 1) return opts[0];
  const i = Math.floor(rng() * opts.length);
  return opts[Math.min(i, opts.length - 1)];
}

/**
 * Resolve all desc-related fields on a template for one spawn.
 * Returns concrete strings (or null for mask-none).
 */
export function resolveSpawnFlavor(
  t: NpcTemplate,
  rng: () => number = Math.random,
): {
  shortDesc?: string;
  description?: string;
  mask?: string | null;
  mien?: string;
} {
  const shortDesc = pickFlavor(t.shortDesc, rng);
  const description = pickFlavor(t.description, rng);
  const mask = t.changeling
    ? pickFlavor(t.changeling.mask, rng)
    : undefined;
  const mien = t.changeling
    ? pickFlavor(t.changeling.mien, rng)
    : undefined;

  const out: {
    shortDesc?: string;
    description?: string;
    mask?: string | null;
    mien?: string;
  } = {};
  if (typeof shortDesc === "string") out.shortDesc = shortDesc;
  if (typeof description === "string") {
    out.description = description;
  }
  if (t.changeling) {
    // null means "no Mask"; string means chosen guise.
    if (mask === null) out.mask = null;
    else if (typeof mask === "string") out.mask = mask;
    if (typeof mien === "string") out.mien = mien;
  }
  return out;
}
