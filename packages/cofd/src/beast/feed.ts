// Feeding — slake Vitae from a vessel (VtR 2e simplified).

import type { CofdSheet } from "../stats/sheet.ts";
import { applyDamage, healthMax } from "../health/index.ts";
import {
  isVampireSheet,
  gainVitae,
  clampBp,
  bpRow,
  type VitaeResult,
} from "../vitae/index.ts";

export type FeedSource = "animal" | "human" | "kindred";

export interface FeedResult {
  ok: boolean;
  reason?: string;
  predator?: CofdSheet;
  victim?: CofdSheet;
  gained: number;
  lines: string[];
  /** Suggest +integrity/break when feeding violently. */
  breakingPointHint?: boolean;
}

/**
 * How much Vitae a source can slake at this BP (simplified table).
 * animal: 0 at BP 2+; human: full up to amount; kindred: full.
 */
export function slakeCap(
  bp: number,
  source: FeedSource,
  amount: number,
): number {
  const n = Math.max(0, Math.floor(amount));
  const row = bpRow(bp);
  if (source === "animal") {
    if (row.feed !== "any") return 0;
    return Math.min(n, 1);
  }
  if (source === "human") {
    if (row.feed === "kindred" || row.feed === "eldest") {
      return Math.min(n, 1);
    }
    return n;
  }
  // kindred
  return n;
}

export function parseFeedSource(raw: string): FeedSource | null {
  const q = raw.trim().toLowerCase();
  if (q === "animal" || q === "beast") return "animal";
  if (q === "human" || q === "mortal" || q === "kine") {
    return "human";
  }
  if (
    q === "kindred" ||
    q === "vampire" ||
    q === "vitae"
  ) {
    return "kindred";
  }
  return null;
}

/**
 * Predator drinks `amount` potential Vitae from source type.
 * Optional victim sheet takes lethal damage equal to Vitae taken
 * (1 lethal per Vitae for humans/kindred).
 */
export function applyFeed(
  predator: CofdSheet,
  amount: number,
  source: FeedSource,
  victim?: CofdSheet | null,
): FeedResult {
  if (!isVampireSheet(predator)) {
    return {
      ok: false,
      reason: "Only vampires feed for Vitae.",
      gained: 0,
      lines: [],
    };
  }
  const bp = clampBp(predator.powerStatValue || 1);
  const want = Math.max(1, Math.floor(amount));
  const cap = slakeCap(bp, source, want);
  if (cap < 1) {
    return {
      ok: false,
      reason:
        `At BP ${bp}, ${source} blood no longer slakes Hunger.`,
      gained: 0,
      lines: [],
    };
  }

  const gainedRes: VitaeResult = gainVitae(
    predator,
    cap,
    `from ${source}`,
  );
  if (!gainedRes.ok || !gainedRes.sheet) {
    return {
      ok: false,
      reason: gainedRes.reason,
      gained: 0,
      lines: gainedRes.lines,
    };
  }

  const lines = [...gainedRes.lines];
  let victimOut: CofdSheet | undefined;
  if (victim && source !== "animal") {
    const taken = gainedRes.gained ?? cap;
    const track = victim.health ?? {
      bashing: 0,
      lethal: 0,
      aggravated: 0,
    };
    const max = healthMax(victim);
    victimOut = {
      ...victim,
      health: applyDamage(track, taken, "lethal", max),
    };
    lines.push(
      `Vessel takes %cr${taken}%cn lethal from the feeding.`,
    );
  }

  return {
    ok: true,
    predator: gainedRes.sheet,
    victim: victimOut,
    gained: gainedRes.gained ?? cap,
    lines,
    breakingPointHint: source === "human" && want >= 3,
  };
}
