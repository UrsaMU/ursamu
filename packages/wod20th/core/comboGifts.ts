// core/comboGifts.ts -- Pure helpers for combo gifts (look up, eligibility,
// learn/forget, activation). Persistence + frenzy/pool spend live in the
// command layer; this file mutates only `char.comboGifts` (and only via the
// returned arrays). Activation reuses the gift-action resolver.
import type {
  IComboGiftDef,
  IGiftAction,
  IGiftActionCost,
  IWoDChar,
} from "./types.ts";
import {
  DEFAULT_DIFFICULTY,
  type IDiceRoll,
  resolvePoolExpr,
  rollDice,
} from "./dice.ts";
import { WTA_COMBO_GIFTS } from "../splats/wta/data/comboGifts.ts";
import { lookupGift } from "./giftAction.ts";
import { woundPenalty } from "./wounds.ts";

/** Normalize a user-supplied slug to lookup key form. */
function normSlug(slug: string): string {
  return (slug ?? "").toLowerCase().trim().replace(/\s+/g, "-");
}

/** Normalize a tribe/auspice/breed value to combo-restriction form. */
function normRestrictionToken(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, "-");
}

export interface IComboOpResult {
  ok: boolean;
  message: string;
}

export interface IComboActivation {
  ok: boolean;
  message: string;
  slug: string;
  name?: string;
  level?: number;
  /** Gnosis portion of cost, for hook backwards-compatibility. */
  cost?: number;
  costBreakdown?: IGiftActionCost;
  action?: IGiftAction;
  poolSize?: number;
  poolLabel?: string;
  roll?: IDiceRoll;
}

/** Look up a combo gift by slug (accepts hyphen/space variants). */
export function getComboGift(slug: string): IComboGiftDef | undefined {
  const key = normSlug(slug);
  if (!key) return undefined;
  if (WTA_COMBO_GIFTS[key]) return WTA_COMBO_GIFTS[key];
  // Tolerate space-separated input.
  for (const def of Object.values(WTA_COMBO_GIFTS)) {
    if (def.name.toLowerCase() === slug.toLowerCase().trim()) return def;
  }
  return undefined;
}

/** Does the character know all prereq gifts? */
function hasAllPrereqs(char: IWoDChar, def: IComboGiftDef): boolean {
  return def.prereqs.every((p) => {
    const hit = lookupGift(p);
    if (!hit) return false;
    const want = hit.def.name.toLowerCase();
    return (char.gifts ?? []).some((g) => g.toLowerCase() === want);
  });
}

/** Do the combo's restrictions match this character? */
function matchesRestrictions(char: IWoDChar, def: IComboGiftDef): boolean {
  if (def.restrictions.length === 0) return true;
  const pools = [char.tribe, char.auspice, char.breed]
    .map(normRestrictionToken)
    .filter((s) => s.length > 0);
  return def.restrictions.some((r) => pools.includes(normRestrictionToken(r)));
}

/** All combos this character currently qualifies to learn (haven't yet). */
export function eligibleCombos(char: IWoDChar): IComboGiftDef[] {
  const known = new Set((char.comboGifts ?? []).map((s) => s.toLowerCase()));
  return Object.values(WTA_COMBO_GIFTS).filter((def) =>
    !known.has(def.slug) &&
    hasAllPrereqs(char, def) &&
    matchesRestrictions(char, def)
  );
}

/** Has the character learned this combo? */
export function knowsCombo(char: IWoDChar, slug: string): boolean {
  const def = getComboGift(slug);
  if (!def) return false;
  return (char.comboGifts ?? []).some((s) => s.toLowerCase() === def.slug);
}

/** Boolean + reason: can this char learn the named combo? */
export function canLearnCombo(
  char: IWoDChar,
  slug: string,
): { ok: boolean; reason: string; def?: IComboGiftDef } {
  const def = getComboGift(slug);
  if (!def) return { ok: false, reason: `Unknown combo gift: ${slug}` };
  if (knowsCombo(char, def.slug)) {
    return { ok: false, reason: `${def.name} is already known.`, def };
  }
  if (!matchesRestrictions(char, def)) {
    return {
      ok: false,
      reason: `${def.name} is restricted to: ${def.restrictions.join(", ")}.`,
      def,
    };
  }
  if (!hasAllPrereqs(char, def)) {
    const missing = def.prereqs.filter((p) => {
      const hit = lookupGift(p);
      if (!hit) return true;
      const want = hit.def.name.toLowerCase();
      return !(char.gifts ?? []).some((g) => g.toLowerCase() === want);
    });
    return {
      ok: false,
      reason: `Missing prereq gift(s): ${missing.join(", ")}.`,
      def,
    };
  }
  return { ok: true, reason: "", def };
}

/**
 * XP cost to learn a combo gift = level × 4. Throws on out-of-range level
 * so a malformed data entry can never grant a free or negative-cost combo.
 */
export function comboXpCost(def: IComboGiftDef): number {
  const lvl = def.level;
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > 5) {
    throw new Error(`Invalid combo gift level: ${lvl} (must be integer 1-5)`);
  }
  return lvl * 4;
}

/**
 * Add a combo to the character's learned list. Pure: mutates char.comboGifts.
 * Caller still spends XP and persists.
 */
export function learnCombo(char: IWoDChar, slug: string): IComboOpResult {
  const check = canLearnCombo(char, slug);
  if (!check.ok || !check.def) return { ok: false, message: check.reason };
  char.comboGifts = [...(char.comboGifts ?? []), check.def.slug];
  return { ok: true, message: `Learned ${check.def.name}.` };
}

/** Remove a combo from the known list. Pure; caller persists. */
export function forgetCombo(char: IWoDChar, slug: string): IComboOpResult {
  const def = getComboGift(slug);
  if (!def) return { ok: false, message: `Unknown combo gift: ${slug}` };
  if (!knowsCombo(char, def.slug)) {
    return { ok: false, message: `${def.name} is not known.` };
  }
  char.comboGifts = (char.comboGifts ?? []).filter((s) =>
    s.toLowerCase() !== def.slug
  );
  return { ok: true, message: `Forgot ${def.name}.` };
}

/** Affordability check across all pools (fail-closed). */
export function canAffordComboCost(
  char: IWoDChar,
  cost: IGiftActionCost,
): string | null {
  if (cost.gnosis && cost.gnosis > 0) {
    const cur = char.gnosisCurrent ?? char.gnosis ?? 0;
    if (cur < cost.gnosis) return `Insufficient Gnosis (${cur}/${cost.gnosis}).`;
  }
  if (cost.willpower && cost.willpower > 0) {
    const cur = char.willpowerCurrent ?? char.willpower ?? 0;
    if (cur < cost.willpower) {
      return `Insufficient Willpower (${cur}/${cost.willpower}).`;
    }
  }
  if (cost.rage && cost.rage > 0) {
    const cur = char.rageCurrent ?? char.rage ?? 0;
    if (cur < cost.rage) return `Insufficient Rage (${cur}/${cost.rage}).`;
  }
  return null;
}

function resolveComboPool(
  char: IWoDChar,
  expr: string,
): { pool: number; label: string } | null {
  const substituted = expr.split(/\s*\+\s*/).map((part) => {
    const t = part.trim().toLowerCase();
    if (t === "gnosis") return String(char.gnosisCurrent ?? char.gnosis ?? 0);
    if (t === "willpower") {
      return String(char.willpowerCurrent ?? char.willpower ?? 0);
    }
    if (t === "rage") return String(char.rageCurrent ?? char.rage ?? 0);
    return part.trim();
  }).join("+");
  const r = resolvePoolExpr(char, substituted);
  if (!r) return null;
  return { pool: r.pool, label: expr };
}

/**
 * Resolve a combo-gift activation: validates known, computes cost, and (when
 * declared) rolls the action pool. The caller MUST still spend the pool(s),
 * persist, and pose the room.
 */
export function activateCombo(char: IWoDChar, slug: string): IComboActivation {
  const key = normSlug(slug);
  if (!key) {
    return { ok: false, slug: key, message: "Usage: +combo/use <slug>" };
  }
  const def = getComboGift(key);
  if (!def) {
    return { ok: false, slug: key, message: `Unknown combo gift: ${slug}` };
  }
  if (!knowsCombo(char, def.slug)) {
    return {
      ok: false,
      slug: def.slug,
      name: def.name,
      level: def.level,
      message: `You have not learned ${def.name}.`,
    };
  }

  const action = def.action;
  const costBreakdown: IGiftActionCost = action.cost ?? { gnosis: def.level };

  const shortfall = canAffordComboCost(char, costBreakdown);
  if (shortfall) {
    return {
      ok: false,
      slug: def.slug,
      name: def.name,
      level: def.level,
      action,
      costBreakdown,
      message: shortfall,
    };
  }

  let roll: IDiceRoll | undefined;
  let poolSize: number | undefined;
  let poolLabel: string | undefined;
  if (action.roll) {
    const resolved = resolveComboPool(char, action.roll.pool);
    if (!resolved) {
      return {
        ok: false,
        slug: def.slug,
        name: def.name,
        level: def.level,
        action,
        costBreakdown,
        message: `Cannot resolve pool: ${action.roll.pool}`,
      };
    }
    // M20 wound penalties apply to every dice pool.
    poolSize = Math.max(0, resolved.pool - woundPenalty(char));
    poolLabel = resolved.label;
    if (poolSize <= 0) {
      return {
        ok: false,
        slug: def.slug,
        name: def.name,
        level: def.level,
        action,
        costBreakdown,
        poolSize,
        poolLabel,
        message: `Insufficient dice pool for ${poolLabel} (${poolSize}).`,
      };
    }
    roll = rollDice(poolSize, action.roll.difficulty ?? DEFAULT_DIFFICULTY);
  }

  const legacyCost = costBreakdown.gnosis ?? 0;
  return {
    ok: true,
    slug: def.slug,
    name: def.name,
    level: def.level,
    cost: legacyCost,
    costBreakdown,
    action,
    poolSize,
    poolLabel,
    roll,
    message: `${def.name} activated (level ${def.level}).`,
  };
}
