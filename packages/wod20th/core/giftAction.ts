// core/giftAction.ts -- gift activation logic (pure).
//
// Looks a gift up in WTA_GIFTS by slug, verifies the character has learned it
// (char.gifts stores DISPLAY NAMES, not slugs, so we compare case-insensitively
// against the canonical name), computes the activation cost, and -- when the
// gift carries action data -- resolves and rolls the declared dice pool. The
// caller is responsible for the frenzy gate, spending the pool, persisting,
// and posing the room.
import type {
  IGiftAction,
  IGiftActionCost,
  IGiftDef,
  IWoDChar,
} from "./types.ts";
import {
  DEFAULT_DIFFICULTY,
  type IDiceRoll,
  resolvePoolExpr,
  rollDice,
} from "./dice.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import { woundPenalty } from "./wounds.ts";

export interface IGiftActivation {
  ok: boolean;
  message: string;
  slug: string;
  name?: string;
  level?: number;
  /**
   * Legacy single-pool cost (Gnosis). Preserved for backward compatibility
   * with the v1 stub path; when set the caller spends Gnosis = cost.
   */
  cost?: number;
  /** Structured cost from action data; when present, caller spends each pool. */
  costBreakdown?: IGiftActionCost;
  /** Action data (description / duration / roll spec). */
  action?: IGiftAction;
  /** Resolved dice pool size, when action.roll is present. */
  poolSize?: number;
  /** Human-readable pool label, e.g. "Wits+Empathy". */
  poolLabel?: string;
  /** Dice roll result; only present when action.roll was rolled. */
  roll?: IDiceRoll;
}

/**
 * Normalize a slug to its canonical lookup key. WTA_GIFTS keys use spaces and
 * apostrophes (e.g. "mother's touch"); we also accept shell-friendly forms
 * with hyphens or stripped apostrophes ("mothers-touch", "mothers touch").
 */
function normalize(slug: string): string {
  return (slug ?? "").toLowerCase().trim();
}

/** Look up a gift by user-supplied slug, trying shell-friendly variants. */
export function lookupGift(slug: string): { key: string; def: IGiftDef } | undefined {
  const raw = normalize(slug);
  if (!raw) return undefined;
  const variants = new Set<string>([
    raw,
    raw.replace(/-/g, " "),
    raw.replace(/-/g, " ").replace(/s /g, "'s "),
  ]);
  const flat = raw.replace(/[-' ]+/g, "");
  for (const v of variants) {
    if (WTA_GIFTS[v]) return { key: v, def: WTA_GIFTS[v] };
  }
  for (const [k, def] of Object.entries(WTA_GIFTS)) {
    if (k.replace(/[-' ]+/g, "") === flat) return { key: k, def };
  }
  return undefined;
}

/**
 * Has this character learned `slug`? Compares the gift's canonical name from
 * WTA_GIFTS against entries in `char.gifts` case-insensitively.
 */
export function knowsGift(char: IWoDChar, slug: string): boolean {
  const hit = lookupGift(slug);
  if (!hit) return false;
  const want = hit.def.name.toLowerCase();
  return (char.gifts ?? []).some((g) => g.toLowerCase() === want);
}

/**
 * Verify the character can afford the structured cost. Returns null on
 * success, or a human-readable rejection message on shortfall.
 */
export function canAffordGiftCost(
  char: IWoDChar,
  cost: IGiftActionCost,
): string | null {
  if (cost.gnosis && cost.gnosis > 0) {
    const cur = char.gnosisCurrent ?? char.gnosis ?? 0;
    if (cur < cost.gnosis) {
      return `Insufficient Gnosis (${cur}/${cost.gnosis}).`;
    }
  }
  if (cost.willpower && cost.willpower > 0) {
    const cur = char.willpowerCurrent ?? char.willpower ?? 0;
    if (cur < cost.willpower) {
      return `Insufficient Willpower (${cur}/${cost.willpower}).`;
    }
  }
  if (cost.rage && cost.rage > 0) {
    const cur = char.rageCurrent ?? char.rage ?? 0;
    if (cur < cost.rage) {
      return `Insufficient Rage (${cur}/${cost.rage}).`;
    }
  }
  return null;
}

/**
 * Resolve a pool expression supporting Gnosis / Willpower / Rage as flat
 * substitutions (current values). Returns null if any token is unknown.
 */
function resolveGiftPool(
  char: IWoDChar,
  expr: string,
): { pool: number; label: string } | null {
  const substituted = expr.split(/\s*\+\s*/).map((part) => {
    const t = part.trim().toLowerCase();
    if (t === "gnosis") return String(char.gnosisCurrent ?? char.gnosis ?? 0);
    if (t === "willpower") return String(char.willpowerCurrent ?? char.willpower ?? 0);
    if (t === "rage") return String(char.rageCurrent ?? char.rage ?? 0);
    return part.trim();
  }).join("+");
  const r = resolvePoolExpr(char, substituted);
  if (!r) return null;
  return { pool: r.pool, label: expr };
}

/**
 * Compute a gift activation. When the gift has `action` data, this also
 * rolls the declared pool. The function is pure aside from the RNG used by
 * rollDice -- callers needing determinism in tests should pass a gift
 * without `action.roll`, or evaluate the roll separately.
 *
 * The caller MUST still spend the pool(s), persist, and pose the room.
 */
export function activateGift(char: IWoDChar, slug: string): IGiftActivation {
  const raw = normalize(slug);
  if (!raw) {
    return { ok: false, slug: raw, message: "Usage: +gift/use <slug>" };
  }
  const hit = lookupGift(raw);
  if (!hit) {
    return { ok: false, slug: raw, message: `Unknown gift: ${slug}` };
  }
  const { key, def } = hit;
  if (!knowsGift(char, key)) {
    return {
      ok: false,
      slug: key,
      name: def.name,
      level: def.level,
      message: `You have not learned ${def.name}.`,
    };
  }

  // Legacy path: no action data -> Gnosis = level.
  if (!def.action) {
    return {
      ok: true,
      slug: key,
      name: def.name,
      level: def.level,
      cost: def.level,
      message: `${def.name} ready (level ${def.level}).`,
    };
  }

  // Action path: structured cost + optional roll.
  const action = def.action;
  const costBreakdown: IGiftActionCost = action.cost ?? { gnosis: def.level };

  // Pre-flight affordability check (fail-closed before any roll).
  const shortfall = canAffordGiftCost(char, costBreakdown);
  if (shortfall) {
    return {
      ok: false,
      slug: key,
      name: def.name,
      level: def.level,
      action,
      costBreakdown,
      message: shortfall,
    };
  }

  // Resolve + roll, if declared.
  let roll: IDiceRoll | undefined;
  let poolSize: number | undefined;
  let poolLabel: string | undefined;
  if (action.roll) {
    const resolved = resolveGiftPool(char, action.roll.pool);
    if (!resolved) {
      return {
        ok: false,
        slug: key,
        name: def.name,
        level: def.level,
        action,
        costBreakdown,
        message: `Cannot resolve pool: ${action.roll.pool}`,
      };
    }
    // M20 wound penalties reduce every dice pool the actor rolls.
    poolSize = Math.max(0, resolved.pool - woundPenalty(char));
    poolLabel = resolved.label;
    if (poolSize <= 0) {
      return {
        ok: false,
        slug: key,
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

  // Legacy cost field reflects total Gnosis (or 0 when none in breakdown).
  const legacyCost = costBreakdown.gnosis ?? 0;

  return {
    ok: true,
    slug: key,
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
