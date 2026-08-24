/**
 * Advancement — AP only (house).
 * Unspent AP buys track picks (cost).
 * Level = floor(lifetime AP / perLevel).
 * Edge rating max 3.
 */
import rules from "../data/advancement-rules.json" with {
  type: "json",
};
import type { ISprawlChar, StatKey } from "../db/schemas.ts";
import { STAT_KEYS } from "../db/schemas.ts";

const R = rules as {
  edgeMax?: number;
  ap?: {
    cost?: number;
    perLevel?: number;
    sessionSurvival?: number;
    missionClose?: number;
  };
  /** @deprecated legacy book shape */
  apAlternative?: { cost?: number; sessionSurvival?: number };
};

export const ADVANCE_TRACKS = [
  "morphology",
  "equilibrium",
  "reaction",
  "cognition",
  "affinity",
  "resilience",
  "loadout",
  "edge",
] as const;

export type AdvanceTrack = (typeof ADVANCE_TRACKS)[number];

function apCfg() {
  return R.ap ?? {};
}

/** Unspent AP cost for one +advance/<track>. */
export function apCost(): number {
  return apCfg().cost ??
    R.apAlternative?.cost ??
    100;
}

/** Lifetime AP per level band. */
export function apPerLevel(): number {
  return apCfg().perLevel ?? apCost();
}

export function sessionSurvivalAp(): number {
  return apCfg().sessionSurvival ??
    R.apAlternative?.sessionSurvival ??
    10;
}

/** Staff/job close bonus AP (replaces mission credit). */
export function missionCloseAp(): number {
  return apCfg().missionClose ?? 25;
}

export function edgeMax(): number {
  return R.edgeMax ?? 3;
}

/** Level from lifetime AP earned (never decreases). */
export function levelFromApTotal(apTotal: number): number {
  const per = apPerLevel();
  if (per < 1) return 0;
  return Math.floor(Math.max(0, apTotal) / per);
}

export function syncLevel(c: ISprawlChar): ISprawlChar {
  const total = c.apTotal ?? 0;
  const level = levelFromApTotal(total);
  if ((c.level ?? 0) === level) return c;
  return { ...c, level };
}

/**
 * Grant unspent + lifetime AP; refresh level.
 * All AP income should go through here.
 */
export function grantAp(
  c: ISprawlChar,
  amount: number,
): ISprawlChar {
  const add = Math.max(0, Math.floor(amount));
  if (add <= 0) return syncLevel(c);
  const ap = (c.ap ?? 0) + add;
  const apTotal = (c.apTotal ?? 0) + add;
  return {
    ...c,
    ap,
    apTotal,
    level: levelFromApTotal(apTotal),
  };
}

export function canAdvance(
  c: ISprawlChar,
): { ok: true } | { ok: false; reason: string } {
  if ((c.ap ?? 0) < apCost()) {
    return {
      ok: false,
      reason: `Need ${apCost()} AP (have ${c.ap ?? 0})`,
    };
  }
  return { ok: true };
}

export type ApplyAdvance =
  | { ok: true; next: ISprawlChar; note: string }
  | { ok: false; reason: string };

/**
 * Spend unspent AP for one track pick.
 * Level is lifetime-based — not incremented here.
 */
export function applyAdvance(
  c: ISprawlChar,
  track: string,
  _via: "ap" | "mission" = "ap",
): ApplyAdvance {
  const gate = canAdvance(c);
  if (!gate.ok) return gate;

  const t = track.toLowerCase().trim();
  let next: ISprawlChar = {
    ...c,
    ap: (c.ap ?? 0) - apCost(),
  };
  next = syncLevel(next);

  if ((STAT_KEYS as readonly string[]).includes(t)) {
    const k = t as StatKey;
    next = {
      ...next,
      stats: { ...next.stats, [k]: next.stats[k] + 1 },
    };
    return {
      ok: true,
      next,
      note: `${k} → ${next.stats[k]}`,
    };
  }
  if (t === "resilience" || t === "res") {
    next = {
      ...next,
      resilienceMax: next.resilienceMax + 1,
      resilience: next.resilience + 1,
    };
    return {
      ok: true,
      next,
      note: `Resilience max ${next.resilienceMax}`,
    };
  }
  if (t === "loadout" || t === "load") {
    next = { ...next, loadoutMax: next.loadoutMax + 1 };
    return {
      ok: true,
      next,
      note: `Loadout max ${next.loadoutMax}`,
    };
  }
  if (t === "edge") {
    const cur = next.edgeRating ?? 1;
    if (cur >= edgeMax()) {
      return {
        ok: false,
        reason: `Edge already at max (${edgeMax()})`,
      };
    }
    next = { ...next, edgeRating: cur + 1 };
    return {
      ok: true,
      next,
      note: `Edge rating ${next.edgeRating}/${edgeMax()}`,
    };
  }
  return {
    ok: false,
    reason: `Unknown track. Pick: ${ADVANCE_TRACKS.join(" ")}`,
  };
}

/** @deprecated Use grantAp(c, missionCloseAp()). */
export function markMissionReady(c: ISprawlChar): ISprawlChar {
  return grantAp(c, missionCloseAp());
}

export function grantSessionAp(c: ISprawlChar): ISprawlChar {
  return grantAp(c, sessionSurvivalAp());
}
