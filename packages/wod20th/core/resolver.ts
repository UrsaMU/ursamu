// core/resolver.ts -- Maps any trait name to its category, type, step, and field path.
// This is the core of the +chargen/set facade: one command, smart dispatch.
import type { IWoDChar, ITraitResolution, IWtaSplatExt, IVtmSplatExt } from "./types.ts";
import { SplatRegistry } from "./registry.ts";
import {
  canonicalAttr,
  canonicalAbil,
  SPECIALTY_OVERRIDE_LIST,
  closestTraits,
  ALL_ATTRIBUTES,
  ALL_ABILITIES,
} from "./attributes.ts";
import { getMagicPath } from "../splats/vtm/data/magicPaths.ts";

// -- Known string fields ----------------------------------------------------

const STRING_ENUM_STEP1 = new Set(["breed", "auspice", "tribe", "clan"]);
const STRING_FREE_STEP1 = new Set(["concept", "deformity"]);

/** Identity fields -- Step 2 (Concept), string-free. */
const IDENTITY_FIELDS: Record<string, string> = {
  fullname:    "fullName",
  "full name": "fullName",
  age:         "age",
  nature:      "nature",
  demeanor:    "demeanor",
};

/** Pool traits -- freebie-spendable only (Step 6). Direct set blocked in chargen. */
const POOL_FIELDS = new Set(["rage", "gnosis", "willpower"]);

/** VtM virtue canonicalization (handles "Self-Control"/"Self Control"/"selfcontrol"). */
const VIRTUE_CANON: Record<string, string> = {
  conscience: "Conscience",
  conviction: "Conviction",
  selfcontrol: "Self-Control",
  instinct: "Instinct",
  courage: "Courage",
};

/** Maximum length for any user-supplied trait name. */
const MAX_TRAIT_NAME_LEN = 64;

/** JS reserved property names that must never be used as background keys (all lowercase). */
const RESERVED_PROPERTY_NAMES = new Set([
  "constructor", "prototype", "__proto__", "__definegetter__",
  "__definesetter__", "__lookupgetter__", "__lookupsetter__",
  "hasownproperty", "isprototypeof", "propertyisenumerable",
  "tostring", "tolocalestring", "valueof",
]);
/** Legacy composite keys -- now handled by +chargen/priority. Resolver
 *  recognizes them only to return a deprecation hint. */
const LEGACY_PRIORITY_KEYS = new Set([
  "attrs.priority", "attributes.priority", "abilities.priority",
]);
const RENOWN_KEYS       = new Set(["renown.glory", "renown.honor", "renown.wisdom"]);
const GIFT_KEYS         = new Set(["gifts.breed", "gifts.auspice", "gifts.tribe"]);

/**
 * Resolves a raw trait name (as typed by the player) to its full resolution.
 * Case-insensitive. Handles dot-notation for specialties (e.g. "Strength.specialty").
 */
export function resolveTrait(char: IWoDChar, raw: string): ITraitResolution {
  if (raw.trim().length > MAX_TRAIT_NAME_LEN) return notFound(raw);
  const lower = raw.trim().toLowerCase();
  const splat = SplatRegistry.get(char.splat);

  // -- Specialty suffix -------------------------------------------------------
  if (lower.endsWith(".specialty")) {
    const parent = raw.slice(0, raw.length - ".specialty".length);
    const attr = canonicalAttr(parent);
    if (attr) {
      return {
        found: true, step: 3, category: "specialty",
        field: `attributeSpecialties.${attr}`,
        parentTrait: attr,
      };
    }
    const abil = canonicalAbil(parent);
    if (abil) {
      return {
        found: true, step: 4, category: "specialty",
        field: `abilitySpecialties.${abil}`,
        parentTrait: abil,
      };
    }
    return notFound(raw);
  }

  // -- Identity fields (Step 2 -- Concept) -----------------------------------
  if (Object.hasOwn(IDENTITY_FIELDS, lower)) {
    return { found: true, step: 2, category: "string-free", field: IDENTITY_FIELDS[lower] };
  }

  // -- Merit / Flaw (Step 5 -- Advantages) -----------------------------------
  if (lower === "merit" || lower === "merits") {
    return { found: true, step: 5, category: "merit", field: "merit" };
  }
  if (lower === "flaw" || lower === "flaws") {
    return { found: true, step: 5, category: "flaw", field: "flaw" };
  }

  // -- Pool traits (freebie-spendable, direct set blocked) ------------------
  if (POOL_FIELDS.has(lower)) {
    if (lower === "rage")      return { found: true, step: 6, category: "number", field: "rage",      min: 1, max: 10 };
    if (lower === "gnosis")    return { found: true, step: 6, category: "number", field: "gnosis",    min: 1, max: 10 };
    if (lower === "willpower") return { found: true, step: 6, category: "number", field: "willpower", min: 1, max: 10 };
  }

  // -- Step 1: string-enum fields ---------------------------------------------
  if (STRING_ENUM_STEP1.has(lower)) {
    const ext = splat?.ext as { breeds?: Array<{id:string}>; auspices?: Array<{id:string}>; tribes?: Array<{displayName:string;id:string}> } | undefined;
    if (lower === "breed") {
      const vals = ext?.breeds?.map((b) => b.id) ?? [];
      return { found: true, step: 1, category: "string-enum", field: "breed", enumValues: vals };
    }
    if (lower === "auspice") {
      const vals = ext?.auspices?.map((a) => a.id) ?? [];
      return { found: true, step: 1, category: "string-enum", field: "auspice", enumValues: vals };
    }
    if (lower === "tribe") {
      const vals = ext?.tribes?.map((t) => t.id) ?? [];
      return { found: true, step: 1, category: "string-enum", field: "tribe", enumValues: vals };
    }
    if (lower === "clan") {
      const vtm = splat?.ext as IVtmSplatExt | undefined;
      const vals = vtm?.clans?.map((c) => c.id) ?? [];
      return { found: true, step: 1, category: "string-enum", field: "clan", enumValues: vals };
    }
  }

  // -- Step 1: free-text fields (concept/deformity) --------------------------
  if (STRING_FREE_STEP1.has(lower)) {
    return { found: true, step: 1, category: "string-free", field: lower };
  }

  // -- Legacy priority composite (removed) -----------------------------------
  // attrs.priority / abilities.priority were replaced by +chargen/priority.
  // Resolver returns notFound; callers that match LEGACY_PRIORITY_KEYS can
  // present a deprecation hint.
  if (LEGACY_PRIORITY_KEYS.has(lower)) {
    return notFound(raw);
  }

  // -- Step 3: attribute names ------------------------------------------------
  // Player sets FINAL rating (1-5). applySet stores extra = n - ATTR_BASE.
  const attr = canonicalAttr(raw);
  if (attr) {
    return {
      found: true, step: 3, category: "number",
      field: `attributes.${attr}`,
      min: 1, max: 5,
    };
  }

  // -- Step 4: ability names --------------------------------------------------
  const abil = canonicalAbil(raw);
  if (abil) {
    const isOverride = (SPECIALTY_OVERRIDE_LIST as readonly string[]).includes(abil);
    return {
      found: true, step: 4, category: "number",
      field: `abilities.${abil}`,
      min: 0, max: 5,
      stepMax: isOverride ? 5 : 3, // soft cap at chargen
    };
  }

  // -- Step 5: renown components ----------------------------------------------
  if (RENOWN_KEYS.has(lower)) {
    const key = lower.split(".")[1]; // "glory" | "honor" | "wisdom"
    return { found: true, step: 5, category: "number", field: `renown.${key}`, min: 0, max: 10 };
  }

  // -- Step 5: gift pick (preferred: +chargen/set gift=<Name>) --------------
  if (lower === "gift" || lower === "gifts") {
    return {
      found: true,
      step: 5,
      category: "gift-auto",
      field: "gift",
    };
  }

  // -- Step 5: gift slots (optional explicit gifts.breed=...) ---------------
  if (GIFT_KEYS.has(lower)) {
    const slot = lower.split(".")[1]; // "breed" | "auspice" | "tribe"
    return {
      found: true,
      step: 5,
      category: "string-enum",
      field: `gifts.${slot}`,
      enumValues: [],
    };
  }

  // -- Step 5: gift by bare name (+chargen/set Persuasion=1) ----------------
  // Before background fallback so gift titles are not treated as bgs.
  // applyGiftAuto handles pool membership / slot pick / error text.
  const giftExt = splat?.ext as IWtaSplatExt | undefined;
  if (giftExt?.gifts) {
    const giftDef = findGiftDef(giftExt, lower);
    if (giftDef) {
      const slot = detectGiftSlot(char, giftExt, giftDef.name);
      return {
        found: true,
        step: 5,
        category: "gift-auto",
        field: slot ? `gifts.${slot}` : "gift",
        parentTrait: giftDef.name,
      };
    }
  }

  // -- Step 5: VtM blood-magic secondary paths (explicit path.<name>) --------
  if (lower.startsWith("path.")) {
    const name = raw.split(".").slice(1).join(".").trim();
    const mp = getMagicPath(name);
    if (mp) {
      return {
        found: true, step: 5, category: "number",
        field: `disciplines.${mp.name}`,
        min: 0, max: 5,
      };
    }
  }

  // -- Step 5: VtM virtues (Conscience / Self-Control / Courage + Path swaps) -
  {
    const q = lower.replace(/[- ]/g, "");
    const virtue = VIRTUE_CANON[q];
    if (virtue) {
      return {
        found: true, step: 5, category: "number",
        field: `virtues.${virtue}`,
        min: 1, max: 5,
      };
    }
  }

  // -- Step 5: VtM disciplines (bare name -> disciplines.<Canon>) ------------
  {
    const vtm = splat?.ext as IVtmSplatExt | undefined;
    if (vtm?.disciplines) {
      const disc = Object.values(vtm.disciplines).find(
        (d) => d.name.toLowerCase() === lower || d.id === lower,
      );
      if (disc) {
        return {
          found: true, step: 5, category: "number",
          field: `disciplines.${disc.name}`,
          min: 0, max: 5,
        };
      }
    }
    // Blood-magic path by bare name (e.g. "Green Path", "Ash Path").
    const mp = getMagicPath(lower);
    if (mp) {
      return {
        found: true, step: 5, category: "number",
        field: `disciplines.${mp.name}`,
        min: 0, max: 5,
      };
    }
  }

  // -- Step 5: background names (anything not already matched) ---------------
  // We accept any background name; validation checks pool restrictions.
  // Detect by pattern: known backgrounds OR anything that doesn't match attr/abil.
  if (isLikelyBackground(raw)) {
    return {
      found: true, step: 5, category: "number",
      field: `backgrounds.${toBackgroundKey(raw)}`,
      min: 0, max: 5,
    };
  }

  // -- Not found --------------------------------------------------------------
  return notFound(raw);
}

/** All valid trait names for +chargen/traits listing. */
export function allTraitNames(char: IWoDChar): string[] {
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as { breeds?: Array<{id:string}>; auspices?: Array<{id:string}>; tribes?: Array<{displayName:string}> } | undefined;
  return [
    // Step 1 -- sub-template
    "breed", "auspice", "tribe", "deformity",
    // Step 2 -- concept
    "fullname", "age", "nature", "demeanor", "concept",
    // Step 3 -- attributes (priority via +chargen/priority attrs=...)
    ...(ALL_ATTRIBUTES as readonly string[]),
    ...(ALL_ATTRIBUTES as readonly string[]).map((a) => `${a}.specialty`),
    // Step 4 -- abilities (priority via +chargen/priority abilities=...)
    ...(ALL_ABILITIES as readonly string[]),
    ...(ALL_ABILITIES as readonly string[]).map((a) => `${a}.specialty`),
    // Step 5 -- advantages
    "renown.glory", "renown.honor", "renown.wisdom",
    "gifts.breed", "gifts.auspice", "gifts.tribe",
    "merit", "flaw",
    // Step 6 -- pools
    "rage", "gnosis", "willpower",
    // Common backgrounds
    ...KNOWN_BACKGROUNDS,
  ].filter((t) => {
    // hide breed/auspice/tribe/deformity for splats that don't use them
    if (!ext?.breeds && ["breed", "auspice", "tribe", "deformity"].includes(t)) return false;
    return true;
  });
}

/** "Did you mean?" helper used in error messages. */
export function didYouMean(raw: string): string {
  if (raw.length > MAX_TRAIT_NAME_LEN) return "";
  const suggestions = closestTraits(raw);
  if (suggestions.length === 0) return "";
  return `Did you mean: ${suggestions.join(", ")}?`;
}

// -- Helpers ----------------------------------------------------------------

function notFound(_raw: string): ITraitResolution {
  return { found: false, step: 1, category: "string-free", field: "" };
}

/** Known background display names (lower) -- never steal via gift prefix. */
const BACKGROUND_NAMES = new Set(
  [
    "allies", "ancestors", "contacts", "fetish", "kinfolk", "mentor",
    "past life", "pure breed", "resources", "rites", "spirit heritage",
    "totem",
  ],
);

/** Look up a gift def by exact key or unique name prefix / case-fold. */
function findGiftDef(
  ext: IWtaSplatExt,
  lower: string,
): { name: string } | undefined {
  if (!ext.gifts) return undefined;
  const direct = ext.gifts[lower];
  if (direct) return direct;
  const exact = Object.values(ext.gifts).find(
    (g) => g.name.toLowerCase() === lower,
  );
  if (exact) return exact;
  // Prefix match must not eat backgrounds (Totem → "Totem Gift").
  if (BACKGROUND_NAMES.has(lower)) return undefined;
  const hits = Object.values(ext.gifts).filter((g) =>
    g.name.toLowerCase().startsWith(lower + " ") ||
    g.name.toLowerCase().startsWith(lower)
  );
  // Prefer starts-with whole word: "totem " not bare if ambiguous
  const wordHits = hits.filter((g) => {
    const n = g.name.toLowerCase();
    return n === lower || n.startsWith(lower + " ") ||
      n.startsWith(lower + "'");
  });
  const pool = wordHits.length > 0 ? wordHits : hits;
  if (pool.length === 1) return pool[0];
  return undefined;
}

/**
 * Given a gift name, determine which slot (breed/auspice/tribe) it belongs to
 * for this character. Prefers unfilled slots; falls back to first matching pool.
 * Returns null if the gift is not in any of the character's beginning-gift pools.
 */
export function detectGiftSlot(
  char: IWoDChar,
  ext: IWtaSplatExt,
  giftName: string,
): "breed" | "auspice" | "tribe" | null {
  const lower = giftName.toLowerCase();
  const breedDef = ext.breeds?.find((b) => b.id === char.breed);
  const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
  const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);

  const inBreed = breedDef?.beginningGifts.some((g) =>
    g.toLowerCase() === lower
  ) ?? false;
  const inAuspice = auspiceDef?.beginningGifts.some((g) =>
    g.toLowerCase() === lower
  ) ?? false;
  const inTribe = tribeDef?.beginningGifts.some((g) =>
    g.toLowerCase() === lower
  ) ?? false;

  const candidates = (
    [inBreed && "breed", inAuspice && "auspice", inTribe && "tribe"] as const
  ).filter((s): s is "breed" | "auspice" | "tribe" => s !== false);

  if (candidates.length === 0) return null;

  // Prefer the slot that isn't filled yet
  const gifts = char.gifts ?? ["", "", ""];
  const slotIdx: Record<string, number> = {
    breed: 0,
    auspice: 1,
    tribe: 2,
  };
  return candidates.find((s) => !gifts[slotIdx[s]]) ??
    candidates[0];
}

/** Normalise a background name to a storage key (Title Case preserved). */
export function toBackgroundKey(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Heuristic: treat as a background if it looks like a known background name
 *  OR if it starts with an uppercase letter and contains only letters/spaces/hyphens/apostrophes.
 *  Reserved JS property names are explicitly rejected. */
function isLikelyBackground(raw: string): boolean {
  const trimmed = raw.trim();
  if (RESERVED_PROPERTY_NAMES.has(trimmed.toLowerCase())) return false;
  if (KNOWN_BACKGROUNDS_SET.has(trimmed.toLowerCase())) return true;
  return /^[A-Za-z][A-Za-z\s\-']+$/.test(trimmed) && trimmed.length >= 3;
}

export const KNOWN_BACKGROUNDS = [
  "Allies", "Ancestors", "Contacts", "Fetish", "Kinfolk",
  "Mentor", "Pure Breed", "Resources", "Rites", "Spirit Heritage", "Totem",
];

const KNOWN_BACKGROUNDS_SET = new Set(KNOWN_BACKGROUNDS.map((b) => b.toLowerCase()));
