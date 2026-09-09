// core/chargen.ts -- ChargenEngine: processes +chargen/set mutations,
// manages step transitions, and returns budget feedback.
import type { IWoDChar, IStepBudget, IWtaSplatExt, IVtmSplatExt, INoteEntry } from "./types.ts";
import { SplatRegistry } from "./registry.ts";
import {
  generationFromBgDots,
  applyGenerationPools,
} from "../splats/vtm/data/generation.ts";
import { resolveTrait, didYouMean } from "./resolver.ts";
import { validateStep, freebiesCost } from "./validator.ts";
import {
  ATTR_BASE,
  ATTR_CATEGORY_NAMES,
  ABIL_CATEGORY_NAMES,
  canonicalAttr,
  canonicalAbil,
  SPECIALTY_OVERRIDE_LIST,
} from "./attributes.ts";
import type { AttributeGroup, AbilityGroup } from "./attributes.ts";

export interface SetResult {
  ok: boolean;
  message: string;
  budget?: IStepBudget;
}

/** Maximum length for single-line free-text fields (concept, deformity). */
const MAX_FREE_TEXT_LEN = 120;
/** Maximum length for multi-line note bodies (background, personality, etc.). */
const MAX_NOTE_LEN = 2000;
/** Maximum length for note name slugs. */
const MAX_NOTE_NAME_LEN = 40;

/** Strip MUSH color/formatting codes from a string before storing. */
function stripMushCodes(s: string): string {
  return s.replace(/%c[a-zA-Z]/g, "").replace(/%[rntbR]/g, "");
}

// -- Apply +chargen/set <trait>=<value> ------------------------------------

/**
 * Applies a single trait assignment. Returns ok=false with a message if
 * validation or step-gating fails. On success, mutates `char` in place and
 * returns the affected step's budget.
 */
export function applySet(char: IWoDChar, rawTrait: string, rawValue: string): SetResult {
  // Trait-side qualifier: Contacts(Street Cops)=3  or  Language(Spanish)=1
  const strippedTrait = stripMushCodes(rawTrait).trim();
  const { base: traitBase, detail: traitDetail } = splitNameDetail(
    strippedTrait,
  );
  const traitName = traitBase || strippedTrait;
  const value = stripMushCodes(rawValue).trim();
  if (!value) return { ok: false, message: "Value cannot be empty." };

  // Friendly redirect for the retired composite syntax.
  const lowerTrait = traitName.toLowerCase();
  if (lowerTrait === "attrs.priority" || lowerTrait === "attributes.priority") {
    return {
      ok: false,
      message: "Attribute priority now uses +chargen/priority attrs=physical/social/mental.",
    };
  }
  if (lowerTrait === "abilities.priority") {
    return {
      ok: false,
      message: "Ability priority now uses +chargen/priority abilities=talents/skills/knowledges.",
    };
  }

  // Merit-as-trait: Language(Spanish)=1  or  Language=Spanish
  // Do NOT steal pure-dot sets (Pure Breed=2, Kinfolk=3) -- those are bgs.
  {
    const splat = SplatRegistry.get(char.splat);
    const mdef = findMeritDef(splat?.merits, traitName);
    const pureDots = /^\d+$/.test(value);
    if (mdef && (!pureDots || traitDetail)) {
      const prev = validateStep(char, 4);
      if (!prev.complete) {
        return {
          ok: false,
          message: "Step 4 is not complete. Finish it first.",
          budget: prev,
        };
      }
      // Language(Spanish)=1  →  "Language(Spanish)"
      // Language=Spanish     →  "Language(Spanish)" when needsDetail
      let spec: string;
      if (traitDetail) {
        spec = `${mdef.name}(${traitDetail})`;
      } else if (mdef.needsDetail) {
        spec = `${mdef.name}(${value})`;
      } else {
        spec = mdef.name;
      }
      return applyMerit(char, spec);
    }
  }

  const res = resolveTrait(char, traitName);

  if (!res.found) {
    const hint = didYouMean(traitName);
    const hintStr = hint ? ` ${hint}` : "";
    return {
      ok: false,
      message:
        `Unknown trait "${traitName}".${hintStr} ` +
        `Type +chargen/traits for valid names.`,
    };
  }

  // Step gate: cannot write step N if step N-1 is incomplete
  if (res.step > 1) {
    const prevStep = (res.step - 1) as 1 | 2 | 3 | 4 | 5;
    const prevBudget = validateStep(char, prevStep);
    if (!prevBudget.complete) {
      return {
        ok: false,
        message: `Step ${prevStep} is not complete. Finish it first.`,
        budget: prevBudget,
      };
    }
  }

  // -- Apply by category ----------------------------------------------------

  if (res.category === "string-free") {
    const clean = value;
    if (clean.length > MAX_FREE_TEXT_LEN) {
      return {
        ok: false,
        message:
          `${traitName} is too long (max ${MAX_FREE_TEXT_LEN} characters).`,
      };
    }
    setNestedField(char, res.field, clean);
    return {
      ok: true,
      message: `Set ${traitName} to "${clean}".`,
      budget: validateStep(char, res.step),
    };
  }

  // Gift by name: +chargen/set gift=Persuasion  OR  +chargen/set Persuasion=1
  if (res.category === "gift-auto") {
    const giftName = res.parentTrait && isGiftToggleValue(value)
      ? res.parentTrait
      : value;
    return applyGiftAuto(char, giftName);
  }

  if (res.category === "string-enum") {
    // Explicit gifts.breed=Name still works
    if (res.field.startsWith("gifts.")) {
      return applyGiftSlot(char, res.field, value);
    }
    // Tribe: fuzzy match on display name
    if (res.field === "tribe") {
      return applyTribe(char, value);
    }
    const enumValues = res.enumValues ?? [];
    const matched = enumValues.find(
      (v) => v.toLowerCase() === value.toLowerCase()
    );
    if (!matched) {
      return {
        ok: false,
        message:
          `"${value}" is not valid for ${traitName}. ` +
          `Valid values: ${enumValues.join(", ")}`,
      };
    }
    setNestedField(char, res.field, matched);
    // When breed/auspice/tribe changes, re-seed rage/gnosis/willpower
    if (["breed", "auspice", "tribe"].includes(res.field)) {
      seedPools(char);
    }
    // VtM: choosing a clan seeds virtues/generation defaults.
    if (res.field === "clan") {
      applyVtmClan(char, matched);
    }
    return {
      ok: true,
      message: `Set ${traitName} to "${matched}".`,
      budget: validateStep(char, res.step),
    };
  }

  if (res.category === "merit") {
    // merit=Language(Spanish)  OR  Language(Spanish)=1 (bare gift-style)
    const meritRaw = traitDetail
      ? `${value}(${traitDetail})`
      : value;
    return applyMerit(char, meritRaw);
  }

  if (res.category === "flaw") {
    return applyFlaw(char, value);
  }

  if (res.category === "number") {
    // Pool traits (rage/gnosis/willpower) are seeded from tables; use +chargen/spend to increase.
    if (res.field === "rage" || res.field === "gnosis" || res.field === "willpower") {
      return {
        ok: false,
        message:
          `Use %ch+chargen/spend ${traitName}=<dots>%cn to raise ` +
          `${traitName} with freebie points.`,
      };
    }

    // Value may still be "3: alt detail"; trait paren wins when both set.
    const { dots: rawDots, detail: valueDetail } = splitDotsDetail(value);
    const bgDetail = traitDetail ?? valueDetail;
    const n = parseInt(rawDots, 10);
    if (isNaN(n) || n < 0 || !Number.isInteger(Number(rawDots))) {
      return {
        ok: false,
        message: `${traitName} requires a non-negative integer.`,
      };
    }
    const min = res.min ?? 0;
    const max = res.max ?? 5;
    // During steps 1-4, enforce stepMax; step 5 freebies use max
    const cap = char.chargenStep < 6 && res.stepMax !== undefined
      ? res.stepMax
      : max;
    if (n < min) {
      return { ok: false, message: `${traitName} minimum is ${min}.` };
    }
    if (n > cap) {
      const hint = cap < max
        ? ` (use +chargen/spend to raise above ${cap} with freebie points)`
        : "";
      return {
        ok: false,
        message: `${traitName} maximum at this stage is ${cap}.${hint}`,
      };
    }

    // Attributes: player sets FINAL rating (1-5). DB stores extra above
    // ATTR_BASE so sheet/rolls still do base+extra.
    let stored = n;
    if (res.field.startsWith("attributes.")) {
      stored = n - ATTR_BASE;
    }
    setNestedField(char, res.field, stored);

    // Optional background focus: Contacts(Street Cops)=3
    let detailMsg = "";
    if (res.field.startsWith("backgrounds.")) {
      const bgName = res.field.slice("backgrounds.".length);
      if (bgDetail) {
        const clean = bgDetail.trim();
        if (clean.length > MAX_FREE_TEXT_LEN) {
          return {
            ok: false,
            message: `Detail too long (max ${MAX_FREE_TEXT_LEN}).`,
          };
        }
        char.backgroundDetails = {
          ...(char.backgroundDetails ?? {}),
          [bgName]: clean,
        };
        detailMsg = ` (${clean})`;
      } else if (n === 0 && char.backgroundDetails?.[bgName]) {
        delete char.backgroundDetails[bgName];
      }
    }

    // VtM: re-derive WP/Humanity/generation pools when virtues or the
    // Generation background move.
    if (
      res.field.startsWith("virtues.") ||
      res.field === "backgrounds.Generation"
    ) {
      seedVtmDerived(char);
    }
    return {
      ok: true,
      message: `Set ${traitName}${detailMsg} to ${n}.`,
      budget: validateStep(char, res.step),
    };
  }

  if (res.category === "specialty") {
    return applySpecialty(char, res, value, rawTrait);
  }

  if (res.category === "composite") {
    // Legacy path -- kept defensively. The resolver no longer returns "composite"
    // for attrs.priority / abilities.priority; use applyPriority via +chargen/priority.
    return applyComposite(char, res.field, value);
  }

  return { ok: false, message: `Cannot set "${rawTrait}".` };
}

// -- Apply +chargen/priority <kind>=<a>/<b>/<c> ----------------------------

/**
 * Set attribute or ability priority. `kind` must be "attrs" (or "attributes")
 * or "abilities". Value is three unique category names separated by "/" "," or
 * whitespace. Replaces the old `+chargen/set attrs.priority=...` composite.
 */
export function applyPriority(char: IWoDChar, kind: string, value: string): SetResult {
  const k = kind.toLowerCase().trim();
  if (k === "attrs" || k === "attributes") {
    // Gate: Step 2 must be complete to set attribute priority (Step 3).
    const prev = validateStep(char, 2);
    if (!prev.complete) {
      return { ok: false, message: "Step 2 is not complete. Finish it first.", budget: prev };
    }
    return applyComposite(char, "attributePriority", value);
  }
  if (k === "abilities") {
    // Gate: Step 3 must be complete to set ability priority (Step 4).
    const prev = validateStep(char, 3);
    if (!prev.complete) {
      return { ok: false, message: "Step 3 is not complete. Finish it first.", budget: prev };
    }
    return applyComposite(char, "abilityPriority", value);
  }
  return {
    ok: false,
    message: `Unknown priority "${kind}". Use "attrs" or "abilities".`,
  };
}

// -- Spend freebie points (+chargen/spend <trait>=<dots>) ------------------

export function applySpend(char: IWoDChar, rawTrait: string, rawDots: string): SetResult {
  if (char.chargenStep < 6) {
    return { ok: false, message: "Freebie spending is only available in Step 6." };
  }

  const res = resolveTrait(char, rawTrait);
  if (!res.found) {
    return { ok: false, message: `Unknown trait "${rawTrait}".` };
  }

  const dots = parseInt(rawDots, 10);
  if (isNaN(dots) || dots < 1) {
    return { ok: false, message: "Dots must be a positive integer." };
  }

  const splat = SplatRegistry.get(char.splat);
  if (!splat) return { ok: false, message: "Splat not found." };

  const cost = freebiesCost(splat, res.field, dots);
  if (cost === 0) return { ok: false, message: `Cannot spend freebies on "${rawTrait}".` };
  if (cost > char.freebiesRemaining) {
    return { ok: false, message: `Not enough freebies (need ${cost}, have ${char.freebiesRemaining}).` };
  }

  // Apply the dot increase. Attributes store extras above ATTR_BASE;
  // spend raises the FINAL rating (player-facing max is res.max).
  const current = (getNestedField(char, res.field) as number) ?? 0;
  const isAttr = res.field.startsWith("attributes.");
  const currentTotal = isAttr ? current + ATTR_BASE : current;
  const nextTotal = currentTotal + dots;
  const hardMax = res.max ?? 5;
  if (nextTotal > hardMax) {
    return {
      ok: false,
      message: `${rawTrait} cannot exceed ${hardMax}.`,
    };
  }
  const next = isAttr ? nextTotal - ATTR_BASE : nextTotal;

  setNestedField(char, res.field, next);
  char.freebiesRemaining -= cost;
  // Store the canonical field path as the trait identifier (bounded, unambiguous).
  const canonicalTrait = res.field.length <= 64 ? res.field : res.field.slice(0, 64);
  char.freebiesLog.push({
    trait: canonicalTrait,
    dots,
    cost,
    timestamp: Date.now(),
  });
  syncFreebiesDone(char);

  return {
    ok: true,
    message: `Spent ${cost} freebies on ${rawTrait} (+${dots} dots). ${char.freebiesRemaining} remaining.`,
    budget: validateStep(char, 6),
  };
}

/** Remove the last freebie entry for a given trait. */
export function applyUnspend(char: IWoDChar, rawTrait: string): SetResult {
  const res = resolveTrait(char, rawTrait);
  if (!res.found) return { ok: false, message: `Unknown trait "${rawTrait}".` };

  // Entries are now keyed by canonical field path (e.g. "attributes.Strength");
  // match against the resolved field so lookup works regardless of input case.
  const idx = [...char.freebiesLog].reverse().findIndex((e) => e.trait === res.field || e.trait.toLowerCase() === rawTrait.toLowerCase());
  if (idx === -1) return { ok: false, message: `No freebie entries found for "${rawTrait}".` };

  const realIdx = char.freebiesLog.length - 1 - idx;
  const entry = char.freebiesLog[realIdx];
  char.freebiesLog.splice(realIdx, 1);
  char.freebiesRemaining += entry.cost;

  const current = (getNestedField(char, res.field) as number) ?? 0;
  setNestedField(char, res.field, Math.max(0, current - entry.dots));
  syncFreebiesDone(char);

  return {
    ok: true,
    message: `Removed ${entry.cost} freebie spend on ${rawTrait}. ${char.freebiesRemaining} remaining.`,
    budget: validateStep(char, 6),
  };
}

/**
 * Mark Step 6 freebies finished while keeping leftover points unspent.
 * New players often leave freebies on the table; this is the explicit exit.
 */
export function applyFreebiesDone(char: IWoDChar): SetResult {
  if (char.chargenStep < 6) {
    return {
      ok: false,
      message: "Finish Steps 1-5 first, then use +chargen/done in Step 6.",
    };
  }
  if (char.freebiesRemaining < 0) {
    return {
      ok: false,
      message: "You overspent freebies. Undo with +chargen/unspend first.",
    };
  }
  char.freebiesDone = true;
  const left = char.freebiesRemaining;
  const tip = left > 0
    ? ` Leaving ${left} unspent (ok).`
    : " Bank is empty.";
  return {
    ok: true,
    message:
      `Freebies closed.${tip}%r` +
      `This is NOT a staff submit.%r` +
      `Next: %ch+sheet%cn to review, then ` +
      `%ch+chargen/submit%cn to send to staff.`,
    budget: validateStep(char, 6),
  };
}

/** Empty bank => done; leftover without confirm => not done. */
function syncFreebiesDone(char: IWoDChar): void {
  if ((char.freebiesRemaining ?? 0) <= 0) {
    char.freebiesDone = true;
  } else {
    char.freebiesDone = false;
  }
}

// -- Step advancement -------------------------------------------------------

/**
 * Attempts to advance chargenStep by 1. Only fires when the current step
 * validates cleanly. On entry to Step 5, auto-seeds base rage/gnosis/willpower.
 */
export function advanceStep(char: IWoDChar): SetResult {
  const current = char.chargenStep;
  if (current >= 6) return { ok: false, message: "Already at Step 6." };

  const budget = validateStep(char, current);
  if (!budget.complete) {
    return { ok: false, message: `Step ${current} is not complete yet.`, budget };
  }

  const newStep = (current + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  char.chargenStep = newStep;
  if (newStep === 6 && current < 6) seedPools(char);

  return { ok: true, message: `Advanced to Step ${char.chargenStep}.`, budget: validateStep(char, char.chargenStep) };
}

/** Returns the budget for any step without mutating. */
export function getBudget(char: IWoDChar, step: 1 | 2 | 3 | 4 | 5 | 6): IStepBudget {
  return validateStep(char, step);
}

// -- Seed base pools from tables --------------------------------------------

/**
 * VtM derived stats (V20 p.80): Willpower = Courage,
 * Humanity = Conscience + Self-Control, and generation pools seeded from
 * the Generation background. Idempotent -- safe to call on every
 * virtue/background mutation.
 */
export function seedVtmDerived(char: IWoDChar): void {
  if (char.splat !== "vtm") return;
  const v = char.virtues ?? {};
  const courage = v["Courage"] ?? 1;
  const conscience = v["Conscience"] ?? v["Conviction"] ?? 1;
  const selfControl = v["Self-Control"] ?? v["Instinct"] ?? 1;
  char.willpower = Math.max(1, courage);
  char.humanity = Math.max(1, conscience + selfControl);
  if (char.path === undefined) char.path = "Humanity";
  const genDots = char.backgrounds?.["Generation"] ?? 0;
  const gen = generationFromBgDots(genDots);
  char.generation = gen;
  const pools = applyGenerationPools(gen);
  char.bloodMax = pools.bloodMax;
  char.bloodPerTurn = pools.bloodPerTurn;
  if (char.bloodPool === undefined || char.bloodPool > pools.bloodMax) {
    char.bloodPool = pools.bloodMax;
  }
}

/** Seed VtM defaults when a clan is chosen. */
function applyVtmClan(char: IWoDChar, clanId: string): void {
  char.clan = clanId;
  const ext = SplatRegistry.get(char.splat)?.ext as IVtmSplatExt | undefined;
  if (!ext || char.virtues !== undefined) {
    seedVtmDerived(char);
    return;
  }
  char.virtues = { Conscience: 1, "Self-Control": 1, Courage: 1 };
  char.path = "Humanity";
  seedVtmDerived(char);
}

/** Auto-fill rage/gnosis/willpower from the splat tables when breed/auspice/tribe are set. */
export function seedPools(char: IWoDChar): void {
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;

  if (char.splat === "wta" && ext) {
    if (char.auspice) {
      const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
      if (auspiceDef) char.rage = auspiceDef.initialRage;
    }
    if (char.breed) {
      const breedDef = ext.breeds?.find((b) => b.id === char.breed);
      if (breedDef) char.gnosis = breedDef.initialGnosis;
    }
    if (char.tribe) {
      const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);
      if (tribeDef) char.willpower = tribeDef.initialWillpower;
    }
    // Starting renown
    if (char.auspice && !char.renown) {
      const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
      if (auspiceDef && !auspiceDef.renownFlex) {
        char.renown = { ...auspiceDef.beginningRenown };
      } else if (auspiceDef?.renownFlex) {
        char.renown = { glory: 0, honor: 0, wisdom: 0 };
      }
    }
  } else if (splat?.initialWillpower !== undefined) {
    char.willpower = splat.initialWillpower;
  }
}

// -- Internal helpers -------------------------------------------------------

function applyTribe(char: IWoDChar, value: string): SetResult {
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;
  if (!ext?.tribes) {
    return { ok: false, message: "This splat has no tribes." };
  }
  // Fuzzy match: exact -> display name prefix -> id -> Levenshtein
  const lower = value.toLowerCase();
  const tribe =
    ext.tribes.find((t) => t.displayName.toLowerCase() === lower) ??
    ext.tribes.find((t) => t.id === lower) ??
    ext.tribes.find((t) => t.displayName.toLowerCase().startsWith(lower)) ??
    ext.tribes.find((t) => t.id.startsWith(lower));

  if (!tribe) {
    const names = ext.tribes.map((t) => t.displayName).join(", ");
    return { ok: false, message: `Unknown tribe "${value}". Valid tribes: ${names}` };
  }

  char.tribe = tribe.id;
  seedPools(char);
  return { ok: true, message: `Set tribe to "${tribe.displayName}".`, budget: validateStep(char, 1) };
}

/** Values that mean "take this gift" when the trait itself is the gift name. */
function isGiftToggleValue(v: string): boolean {
  return /^(1|on|yes|true|x|\*|take)?$/i.test(v.trim());
}

/**
 * Pick a starting gift by name; auto-fills breed/auspice/tribe slot.
 * +chargen/set gift=Mother's Touch
 */
function applyGiftAuto(char: IWoDChar, rawName: string): SetResult {
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;
  if (!ext) {
    return { ok: false, message: "Gifts not applicable for this splat." };
  }
  if (!char.breed || !char.auspice || !char.tribe) {
    return {
      ok: false,
      message: "Set breed, auspice, and tribe before choosing gifts.",
    };
  }

  const name = stripMushCodes(rawName).trim();
  if (!name) {
    return {
      ok: false,
      message: "Usage: +chargen/set gift=<Gift Name>",
    };
  }

  const breedDef = ext.breeds?.find((b) => b.id === char.breed);
  const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
  const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);
  const pools: Array<{ slot: "breed" | "auspice" | "tribe"; list: string[] }> = [
    { slot: "breed", list: breedDef?.beginningGifts ?? [] },
    { slot: "auspice", list: auspiceDef?.beginningGifts ?? [] },
    { slot: "tribe", list: tribeDef?.beginningGifts ?? [] },
  ];

  const lower = name.toLowerCase();
  // Exact match first, then unique prefix across all three pools.
  type Hit = { slot: "breed" | "auspice" | "tribe"; gift: string };
  const hits: Hit[] = [];
  for (const { slot, list } of pools) {
    for (const g of list) {
      if (
        g.toLowerCase() === lower ||
        g.toLowerCase().startsWith(lower)
      ) {
        hits.push({ slot, gift: g });
      }
    }
  }
  // Dedupe same gift name appearing in multiple pools
  const byName = new Map<string, Hit[]>();
  for (const h of hits) {
    const k = h.gift.toLowerCase();
    const arr = byName.get(k) ?? [];
    arr.push(h);
    byName.set(k, arr);
  }

  if (byName.size === 0) {
    const avail = pools.flatMap((p) => p.list).join(", ");
    return {
      ok: false,
      message:
        `"${name}" is not in your starting gift pools. ` +
        `Available: ${avail}. See %ch+chargen/giftlist%cn.`,
    };
  }
  if (byName.size > 1) {
    const names = [...byName.keys()].map((k) =>
      byName.get(k)![0].gift
    );
    return {
      ok: false,
      message: `Ambiguous gift "${name}". Try: ${names.join(", ")}`,
    };
  }

  const group = [...byName.values()][0];
  // Prefer unfilled slot among matches for this gift
  const gifts = char.gifts ?? ["", "", ""];
  const slotIdx = { breed: 0, auspice: 1, tribe: 2 } as const;
  const pick = group.find((h) => !gifts[slotIdx[h.slot]]) ??
    group[0];

  return applyGiftSlot(char, `gifts.${pick.slot}`, pick.gift);
}

function applyGiftSlot(
  char: IWoDChar,
  field: string,
  value: string,
): SetResult {
  const slot = field.split(".")[1]; // "breed" | "auspice" | "tribe"
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;
  if (!ext) {
    return { ok: false, message: "Gifts not applicable for this splat." };
  }

  let pool: string[] = [];
  if (slot === "breed") {
    if (!char.breed) return { ok: false, message: "Set breed first." };
    const breedDef = ext.breeds?.find((b) => b.id === char.breed);
    pool = breedDef?.beginningGifts ?? [];
  } else if (slot === "auspice") {
    if (!char.auspice) {
      return { ok: false, message: "Set auspice first." };
    }
    const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
    pool = auspiceDef?.beginningGifts ?? [];
  } else if (slot === "tribe") {
    if (!char.tribe) return { ok: false, message: "Set tribe first." };
    const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);
    pool = tribeDef?.beginningGifts ?? [];
  }

  const lower = value.toLowerCase().trim();
  const matched = pool.find((g) => g.toLowerCase() === lower) ??
    pool.filter((g) => g.toLowerCase().startsWith(lower));
  const gift = Array.isArray(matched)
    ? (matched.length === 1 ? matched[0] : undefined)
    : matched;
  if (!gift) {
    const hint = Array.isArray(matched) && matched.length > 1
      ? ` Ambiguous — try: ${matched.join(", ")}`
      : ` Available: ${pool.join(", ")}`;
    return {
      ok: false,
      message: `"${value}" is not in the ${slot} gift pool.${hint}`,
    };
  }

  char.gifts = char.gifts ?? ["", "", ""];
  const idx = slot === "breed" ? 0 : slot === "auspice" ? 1 : 2;
  char.gifts[idx] = gift;

  return {
    ok: true,
    message: `Set ${slot} gift to "${gift}".`,
    budget: validateStep(char, 5),
  };
}

function applySpecialty(
  char: IWoDChar,
  res: ReturnType<typeof resolveTrait>,
  value: string,
  rawTrait: string,
): SetResult {
  const parent = res.parentTrait!;
  const isAttr = !!canonicalAttr(parent);
  const isAbil = !!canonicalAbil(parent);

  if (isAttr) {
    const total = ATTR_BASE + (char.attributes[parent] ?? 0);
    if (total < 4) {
      return { ok: false, message: `${parent} must be at least 4 to assign a specialty (currently ${total}).` };
    }
    char.attributeSpecialties[parent] = value;
    return { ok: true, message: `Set ${parent} specialty to "${value}".`, budget: validateStep(char, 2) };
  }

  if (isAbil) {
    const dots = char.abilities[parent] ?? 0;
    const isOverride = (SPECIALTY_OVERRIDE_LIST as readonly string[]).includes(parent);
    if (dots < 4 && !isOverride) {
      return { ok: false, message: `${parent} must be at least 4 to assign a specialty (currently ${dots}).` };
    }
    char.abilitySpecialties[parent] = value;
    return { ok: true, message: `Set ${parent} specialty to "${value}".`, budget: validateStep(char, 3) };
  }

  return { ok: false, message: `Cannot set specialty on "${rawTrait}".` };
}

function applyComposite(char: IWoDChar, field: string, value: string): SetResult {
  if (field === "attributePriority") {
    const parts = value.toLowerCase().split(/[\/,\s]+/).filter(Boolean);
    if (parts.length !== 3 || new Set(parts).size !== 3 ||
      !parts.every((p) => ATTR_CATEGORY_NAMES.includes(p as AttributeGroup))) {
      return {
        ok: false,
        message: `Attribute priority must be 3 unique values from: ${ATTR_CATEGORY_NAMES.join(", ")}. Example: +chargen/priority attrs=physical/social/mental`,
      };
    }
    char.attributePriority = parts as [string, string, string];
    return { ok: true, message: `Attribute priority: ${parts.join(" > ")}.`, budget: validateStep(char, 2) };
  }

  if (field === "abilityPriority") {
    const parts = value.toLowerCase().split(/[\/,\s]+/).filter(Boolean);
    if (parts.length !== 3 || new Set(parts).size !== 3 ||
      !parts.every((p) => ABIL_CATEGORY_NAMES.includes(p as AbilityGroup))) {
      return {
        ok: false,
        message: `Ability priority must be 3 unique values from: ${ABIL_CATEGORY_NAMES.join(", ")}. Example: +chargen/priority abilities=talents/skills/knowledges`,
      };
    }
    char.abilityPriority = parts as [string, string, string];
    return { ok: true, message: `Ability priority: ${parts.join(" > ")}.`, budget: validateStep(char, 3) };
  }

  return { ok: false, message: `Unknown composite field "${field}".` };
}

// -- Merit / Flaw -----------------------------------------------------------

/** Maximum total freebie points returnable from flaws. */
const MAX_FLAW_BONUS = 7;

/**
 * Toggle-adds or removes a merit.
 * Qualified: merit=Language: Spanish  → key "Language (Spanish)"
 * Stackable merits (Language) can be taken once per detail.
 */
function applyMerit(char: IWoDChar, rawName: string): SetResult {
  const splat = SplatRegistry.get(char.splat);
  if (!splat?.merits?.length) {
    return {
      ok: false,
      message:
        `No merit list defined for ${splat?.name ?? char.splat}. ` +
        `See staff for custom merits.`,
    };
  }

  const { base, detail } = splitNameDetail(
    stripMushCodes(rawName).trim(),
  );
  if (!base) {
    return {
      ok: false,
      message: "Usage: +chargen/set merit=<Name>  or  merit=Name: detail",
    };
  }

  const lower = base.toLowerCase();
  const def = splat.merits.find((m) => m.name.toLowerCase() === lower) ??
    splat.merits.find((m) => m.name.toLowerCase().startsWith(lower));
  if (!def) {
    return {
      ok: false,
      message:
        `Unknown merit "${base}". See %ch+chargen/meritlist%cn.`,
    };
  }

  char.merits = char.merits ?? {};
  const label = def.detailLabel ?? "detail";

  // Require qualifier when the merit needs one
  if (def.needsDetail && !detail) {
    // Allow bare name only to remove a sole instance
    const ownedKeys = Object.keys(char.merits).filter((k) =>
      meritBaseName(k).toLowerCase() === def.name.toLowerCase()
    );
    if (ownedKeys.length === 1) {
      return removeMeritKey(char, ownedKeys[0]!);
    }
    if (ownedKeys.length > 1) {
      return {
        ok: false,
        message:
          `Which ${def.name}? Owned: ${ownedKeys.join(", ")}. ` +
          `Remove with merit=${def.name}: <${label}>`,
      };
    }
    return {
      ok: false,
      message:
        `${def.name} needs a ${label}. ` +
        `Example: %ch+chargen/set merit=${def.name}: <${label}>%cn`,
    };
  }

  const key = detail
    ? `${def.name} (${stripMushCodes(detail).trim()})`
    : def.name;

  if (key.length > 64) {
    return { ok: false, message: "Merit name/detail too long (max 64)." };
  }

  // Toggle off exact key
  if (key in char.merits) {
    return removeMeritKey(char, key);
  }

  // Non-stackable: replacing detail updates in place (refund old, charge new)
  if (detail && !def.stackable) {
    const prior = Object.keys(char.merits).find((k) =>
      meritBaseName(k).toLowerCase() === def.name.toLowerCase()
    );
    if (prior) {
      const r = removeMeritKey(char, prior);
      if (!r.ok) return r;
    }
  }

  if (def.cost < 1) {
    return {
      ok: false,
      message:
        `Merit "${def.name}" has an invalid cost (${def.cost}). ` +
        `Contact staff.`,
    };
  }
  if (def.cost > char.freebiesRemaining) {
    return {
      ok: false,
      message:
        `"${def.name}" costs ${def.cost} freebie pts -- ` +
        `you have ${char.freebiesRemaining}.`,
    };
  }

  char.merits[key] = def.cost;
  char.freebiesRemaining -= def.cost;
  char.freebiesLog.push({
    trait: `merit.${key}`,
    dots: 1,
    cost: def.cost,
    timestamp: Date.now(),
  });
  syncFreebiesDone(char);
  return {
    ok: true,
    message:
      `Added merit "${key}" (${def.cost} pt). ` +
      `${char.freebiesRemaining} freebies remaining.`,
    budget: validateStep(char, 5),
  };
}

function removeMeritKey(char: IWoDChar, key: string): SetResult {
  char.merits = char.merits ?? {};
  if (!(key in char.merits)) {
    return { ok: false, message: `You don't have merit "${key}".` };
  }
  const cost = char.merits[key]!;
  delete char.merits[key];
  char.freebiesRemaining += cost;
  const logIdx = [...char.freebiesLog].reverse()
    .findIndex((e) => e.trait === `merit.${key}`);
  if (logIdx !== -1) {
    char.freebiesLog.splice(char.freebiesLog.length - 1 - logIdx, 1);
  }
  syncFreebiesDone(char);
  return {
    ok: true,
    message:
      `Removed merit "${key}". ` +
      `${char.freebiesRemaining} freebies remaining.`,
    budget: validateStep(char, 5),
  };
}

/** "Language (Spanish)" → "Language" */
function meritBaseName(key: string): string {
  const m = key.match(/^(.+?)\s*\([^)]*\)\s*$/);
  return m ? m[1]!.trim() : key.trim();
}

function findMeritDef(
  merits: { name: string }[] | undefined,
  raw: string,
): { name: string; needsDetail?: boolean; stackable?: boolean } | undefined {
  if (!merits?.length) return undefined;
  const lower = raw.trim().toLowerCase();
  return merits.find((m) => m.name.toLowerCase() === lower) ??
    merits.find((m) => m.name.toLowerCase().startsWith(lower));
}

/**
 * Split "Language: Spanish", "Language/Spanish", "Language (Spanish)".
 */
function splitNameDetail(raw: string): { base: string; detail?: string } {
  const s = raw.trim();
  if (!s) return { base: "" };

  const paren = s.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (paren) {
    return { base: paren[1]!.trim(), detail: paren[2]!.trim() };
  }

  const colon = s.indexOf(":");
  if (colon > 0) {
    return {
      base: s.slice(0, colon).trim(),
      detail: s.slice(colon + 1).trim() || undefined,
    };
  }

  // Slash only when not part of a normal name (rare); prefer after first word
  // "Camp Membership/Warders" — allow
  const slash = s.indexOf("/");
  if (slash > 0) {
    return {
      base: s.slice(0, slash).trim(),
      detail: s.slice(slash + 1).trim() || undefined,
    };
  }

  return { base: s };
}

/** "3: street dealers" or "3/harbor" → dots + optional detail */
function splitDotsDetail(raw: string): { dots: string; detail?: string } {
  const s = raw.trim();
  const colon = s.indexOf(":");
  if (colon > 0 && /^\d+$/.test(s.slice(0, colon).trim())) {
    return {
      dots: s.slice(0, colon).trim(),
      detail: s.slice(colon + 1).trim() || undefined,
    };
  }
  const slash = s.indexOf("/");
  if (slash > 0 && /^\d+$/.test(s.slice(0, slash).trim())) {
    return {
      dots: s.slice(0, slash).trim(),
      detail: s.slice(slash + 1).trim() || undefined,
    };
  }
  return { dots: s };
}

/**
 * Toggle-adds or removes a flaw by name.
 * Flaws give back freebie points (capped at MAX_FLAW_BONUS total).
 * Removing a flaw deducts its bonus from freebiesRemaining.
 */
function applyFlaw(char: IWoDChar, rawName: string): SetResult {
  const splat = SplatRegistry.get(char.splat);
  if (!splat?.flaws?.length) {
    return { ok: false, message: `No flaw list defined for ${splat?.name ?? char.splat}. See staff for custom flaws.` };
  }
  const name = stripMushCodes(rawName).trim();
  const lower = name.toLowerCase();
  const def = splat.flaws.find((f) => f.name.toLowerCase() === lower) ??
    splat.flaws.find((f) => f.name.toLowerCase().startsWith(lower));
  if (!def) {
    const names = splat.flaws.map((f) => `${f.name} (${f.bonus}pt)`).join(", ");
    return { ok: false, message: `Unknown flaw "${name}". Available: ${names}` };
  }

  char.flaws = char.flaws ?? {};

  // Guard: data integrity -- flaw bonus must be positive
  if (def.bonus < 1) {
    return { ok: false, message: `Flaw "${def.name}" has an invalid bonus (${def.bonus}). Contact staff.` };
  }

  // Toggle: if already present, remove and deduct bonus
  if (def.name in char.flaws) {
    const bonus = char.flaws[def.name];
    delete char.flaws[def.name];
    if (char.freebiesRemaining < bonus) {
      // Freebies already spent down -- deduct what we can, warn player
      char.freebiesRemaining = 0;
      syncFreebiesDone(char);
      return { ok: true, message: `Removed flaw "${def.name}". Warning: freebie bonus already spent; remaining clamped to 0.`, budget: validateStep(char, 5) };
    }
    char.freebiesRemaining -= bonus;
    syncFreebiesDone(char);
    return { ok: true, message: `Removed flaw "${def.name}". ${char.freebiesRemaining} freebies remaining.`, budget: validateStep(char, 5) };
  }

  // Add: check total flaw bonus cap
  const currentFlawTotal = Object.values(char.flaws).reduce((s, v) => s + v, 0);
  if (currentFlawTotal + def.bonus > MAX_FLAW_BONUS) {
    return {
      ok: false,
      message: `Cannot add "${def.name}" -- total flaw bonus would be ${currentFlawTotal + def.bonus}, exceeding the ${MAX_FLAW_BONUS}-point cap.`,
    };
  }
  char.flaws[def.name] = def.bonus;
  char.freebiesRemaining += def.bonus;
  syncFreebiesDone(char);
  return { ok: true, message: `Added flaw "${def.name}" (+${def.bonus} freebie pt${def.bonus !== 1 ? "s" : ""}). ${char.freebiesRemaining} freebies remaining.`, budget: validateStep(char, 5) };
}

// -- Notes (+notes/set, +notes/del, +notes/public, +notes/private) ---------

/**
 * Create or replace a named note on the character.
 * Note names are case-insensitive for lookup; the original casing is preserved
 * on first write and kept on update.
 */
export function applyNote(char: IWoDChar, rawName: string, rawText: string): SetResult {
  const name = stripMushCodes(rawName).trim();
  if (!name) return { ok: false, message: "Note name cannot be empty." };
  if (name.length > MAX_NOTE_NAME_LEN) {
    return { ok: false, message: `Note name is too long (max ${MAX_NOTE_NAME_LEN} characters).` };
  }
  const text = stripMushCodes(rawText).trim();
  if (!text) return { ok: false, message: "Note text cannot be empty." };
  if (text.length > MAX_NOTE_LEN) {
    return { ok: false, message: `Note text is too long (max ${MAX_NOTE_LEN} characters).` };
  }

  char.notes = char.notes ?? [];
  const existing = char.notes.find((n) => n.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.text = text;
    existing.updatedAt = Date.now();
    return { ok: true, message: `Updated note "${existing.name}".` };
  }

  char.notes.push({ name, text, isPublic: false, updatedAt: Date.now() });
  return { ok: true, message: `Added note "${name}".` };
}

/**
 * Delete a named note. Case-insensitive name match.
 */
export function deleteNote(char: IWoDChar, rawName: string): SetResult {
  const name = rawName.trim();
  char.notes = char.notes ?? [];
  const idx = char.notes.findIndex((n) => n.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) return { ok: false, message: `No note named "${name}".` };
  const removed = char.notes.splice(idx, 1)[0];
  return { ok: true, message: `Deleted note "${removed.name}".` };
}

/**
 * Set the public/private visibility of a named note.
 */
export function setNotePublic(char: IWoDChar, rawName: string, isPublic: boolean): SetResult {
  const name = rawName.trim();
  char.notes = char.notes ?? [];
  const note = char.notes.find((n) => n.name.toLowerCase() === name.toLowerCase());
  if (!note) return { ok: false, message: `No note named "${name}".` };
  note.isPublic = isPublic;
  return { ok: true, message: `Note "${note.name}" is now ${isPublic ? "public" : "private"}.` };
}

// -- Nested field accessor/setter -------------------------------------------

function setNestedField(obj: object, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function getNestedField(obj: object, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
