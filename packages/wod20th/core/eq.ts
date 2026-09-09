// core/eq.ts -- pure equipment helpers (no SDK, no DB).
//
// Items are regular IDBObj things carried in a player's `contents`. Their
// `state` object carries the equipment metadata documented in IEqMeta. This
// module exposes read-only helpers used by the @eq builder and the wear /
// wield commands. Spotting and combat resolution live elsewhere.

// deno-lint-ignore no-explicit-any
type AnyObj = any;

export type EqKind = "weapon" | "armor" | "shield" | "fetish" | "tool" | "misc";
export type WeaponType = "brawl" | "melee" | "firearms" | "thrown";
export type DamageType = "B" | "L" | "A";
export type Concealability = "P" | "J" | "T" | "N";

export interface IEqMeta {
  kind?: EqKind;
  weaponType?: WeaponType;
  damage?: number;
  damageType?: DamageType;
  silver?: boolean;
  fetish?: boolean;
  fetishCost?: number;
  /** Flavor / mechanical description shown by +fetish/info. Builder-set. */
  fetishDesc?: string;
  /** Live-state: true while the fetish is bound and powered. */
  fetishActive?: boolean;
  /** Builder-attr: single-use fetish (talen). Consumed on activation. */
  talen?: boolean;
  /** Live-state: true once a talen has been spent. */
  talenSpent?: boolean;
  /** Builder-attr: true if this item was botched into a Wyrm-tainted vessel. */
  wyrmTainted?: boolean;
  armorRating?: number;
  worn?: boolean;
  wielded?: boolean;
  concealed?: boolean;
  concealability?: Concealability;
  /** Fetish only: slug into WTA_SPIRITS for the bound spirit, if known. */
  spiritSlug?: string;
}

/** M20 concealability difficulty map. "auto" = always spotted. */
export const CONCEAL_DIFFICULTY: Record<Concealability, number | "auto"> = {
  P: 8,
  J: 7,
  T: 6,
  N: "auto",
};

export const EQ_KINDS: EqKind[] = ["weapon", "armor", "shield", "fetish", "tool", "misc"];
export const WEAPON_TYPES: WeaponType[] = ["brawl", "melee", "firearms", "thrown"];
export const DAMAGE_TYPES: DamageType[] = ["B", "L", "A"];
export const CONCEALABILITIES: Concealability[] = ["P", "J", "T", "N"];

/** All eq field keys we manage on state. Used by @eq/clear. */
export const EQ_FIELDS: (keyof IEqMeta)[] = [
  "kind", "weaponType", "damage", "damageType", "silver",
  "fetish", "fetishCost", "fetishDesc", "fetishActive", "armorRating",
  "worn", "wielded", "concealed", "concealability",
  "spiritSlug", "talen", "talenSpent", "wyrmTainted",
];

// Resolve a single attribute value, attributes-array first (engine `&attr`
// writes go there, uppercase), then state-field fallback for backward
// compatibility with @eq's direct $set writes.
function readAttr(obj: AnyObj, name: string): unknown {
  const upper = name.toUpperCase();
  const attrs = obj?.state?.attributes as Array<{ name?: string; value?: unknown }> | undefined;
  if (Array.isArray(attrs)) {
    const hit = attrs.find((a) => (a?.name ?? "").toUpperCase() === upper);
    if (hit && hit.value !== undefined && hit.value !== null && hit.value !== "") return hit.value;
  }
  const direct = obj?.state?.[name];
  if (direct !== undefined && direct !== null && direct !== "") return direct;
  return undefined;
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return undefined;
}

// Live-state flags (worn/wielded/concealed) are toggled by player commands and
// must read DIRECT state to avoid being overridden by a builder's stale attr.
function readLiveBool(obj: AnyObj, name: string): boolean | undefined {
  return asBool(obj?.state?.[name]);
}

/**
 * Read eq metadata from an IDBObj.
 *
 * - Item-definition fields (kind, weaponType, damage, damageType, silver,
 *   fetish, fetishCost, armorRating, concealability) prefer `state.attributes`
 *   (engine `&attr` writes, uppercase) with direct `state.<field>` fallback
 *   for `@eq`'s legacy writes.
 * - Live-state flags (worn, wielded, concealed) always read from direct state,
 *   which the +wear / +wield / +conceal commands own.
 */
export function getEqMeta(obj: AnyObj): IEqMeta {
  return {
    kind:           readAttr(obj, "kind") as EqKind | undefined,
    weaponType:     readAttr(obj, "weaponType") as WeaponType | undefined,
    damage:         asNum(readAttr(obj, "damage")),
    damageType:     readAttr(obj, "damageType") as DamageType | undefined,
    silver:         asBool(readAttr(obj, "silver")),
    fetish:         asBool(readAttr(obj, "fetish")),
    fetishCost:     asNum(readAttr(obj, "fetishCost")),
    fetishDesc:     readAttr(obj, "fetishDesc") as string | undefined,
    fetishActive:   readLiveBool(obj, "fetishActive"),
    armorRating:    asNum(readAttr(obj, "armorRating")),
    worn:           readLiveBool(obj, "worn"),
    wielded:        readLiveBool(obj, "wielded"),
    concealed:      readLiveBool(obj, "concealed"),
    concealability: readAttr(obj, "concealability") as Concealability | undefined,
    spiritSlug:     readAttr(obj, "spiritSlug") as string | undefined,
    talen:          asBool(readAttr(obj, "talen")),
    talenSpent:     readLiveBool(obj, "talenSpent"),
    wyrmTainted:    asBool(readAttr(obj, "wyrmTainted")),
  };
}

export function isWeapon(obj: AnyObj): boolean {
  return getEqMeta(obj).kind === "weapon";
}

export function isArmor(obj: AnyObj): boolean {
  const k = getEqMeta(obj).kind;
  return k === "armor" || k === "shield";
}

/** Items in `holder.contents` flagged wielded. */
export function wieldedWeapons(holder: AnyObj): AnyObj[] {
  const items: AnyObj[] = Array.isArray(holder?.contents) ? holder.contents : [];
  return items.filter((it) => isWeapon(it) && getEqMeta(it).wielded === true);
}

/** Items in `holder.contents` flagged worn (armor or shield). */
export function wornArmor(holder: AnyObj): AnyObj[] {
  const items: AnyObj[] = Array.isArray(holder?.contents) ? holder.contents : [];
  return items.filter((it) => isArmor(it) && getEqMeta(it).worn === true);
}

/** Total soak bonus from worn armor / shields. */
export function totalArmorSoak(holder: AnyObj): number {
  return wornArmor(holder).reduce((sum, it) => {
    const r = getEqMeta(it).armorRating;
    return sum + (typeof r === "number" && r > 0 ? r : 0);
  }, 0);
}

/** Default damage type per weapon type. Brawl=B; melee/firearms/thrown=L. */
export function defaultDamageType(weaponType: WeaponType): DamageType {
  return weaponType === "brawl" ? "B" : "L";
}

// -- Template capture --------------------------------------------------------

/** Eq fields that define a template (excludes live-state toggles). */
export const TEMPLATE_FIELDS: (keyof IEqMeta)[] = [
  "kind", "weaponType", "damage", "damageType", "silver", "fetish",
  "fetishCost", "fetishDesc", "armorRating", "concealability", "spiritSlug",
  "talen", "wyrmTainted",
];

/** Verb attributes (&attr entries) that belong to a template, in display order. */
export const TEMPLATE_VERBS = ["SUCC", "OSUCC", "FAIL", "OFAIL", "USE", "OUSE"] as const;

export interface IEqTemplatePayload {
  /** Desired item name (written to target.name). */
  name?: string;
  /** Desired description (written to target.state.description). */
  desc?: string;
  /** Static eq fields to apply. */
  eq?: Partial<IEqMeta>;
  /** Verb attrs (SUCC/OSUCC/FAIL/OFAIL/USE/OUSE). */
  verbs?: Record<string, string>;
}

/**
 * Capture the reusable definition of an item: the static eq fields, display
 * name/desc, and verb attrs. Live-state flags (worn, wielded, concealed,
 * fetishActive, talenSpent) are intentionally excluded -- those are per-holder.
 */
export function captureEqTemplate(obj: AnyObj): IEqTemplatePayload {
  const meta = getEqMeta(obj);
  // Build through a plain map so exhaustiveness never trips TS on the
  // specific union that indexed writes produce for `Partial<IEqMeta>`.
  // deno-lint-ignore no-explicit-any
  const eq: Record<string, any> = {};
  for (const f of TEMPLATE_FIELDS) {
    const v = meta[f];
    if (v !== undefined && v !== null && v !== "") eq[f] = v;
  }

  const attrs = obj?.state?.attributes as Array<{ name?: string; value?: unknown }> | undefined;
  const verbs: Record<string, string> = {};
  if (Array.isArray(attrs)) {
    for (const a of attrs) {
      const nm = (a?.name ?? "").toUpperCase();
      if ((TEMPLATE_VERBS as readonly string[]).includes(nm) && typeof a.value === "string" && a.value) {
        verbs[nm] = a.value;
      }
    }
  }

  return {
    name: typeof obj?.name === "string" ? obj.name : undefined,
    desc: typeof obj?.state?.description === "string"
      ? obj.state.description
      : undefined,
    eq: Object.keys(eq).length ? eq : undefined,
    verbs: Object.keys(verbs).length ? verbs : undefined,
  };
}
