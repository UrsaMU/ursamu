/**
 * Reputation titles and hire discounts.
 */
import unlocksJson from "../../resources/unlocks.json" with {
  type: "json",
};
import type { RepMap } from "./reputation.ts";

export interface UnlockTier {
  at: number;
  title: string;
  summary: string;
  hireDiscount?: number;
}

export const UNLOCKS: Record<string, UnlockTier[]> =
  unlocksJson as Record<string, UnlockTier[]>;

export function tiersFor(faction: string): UnlockTier[] {
  return UNLOCKS[faction.toLowerCase()] ?? [];
}

/** Highest unlock reached for a faction. */
export function bestUnlock(
  faction: string,
  rep: number,
): UnlockTier | null {
  const tiers = tiersFor(faction);
  let best: UnlockTier | null = null;
  for (const t of tiers) {
    if (rep >= t.at) best = t;
  }
  return best;
}

export function titleFor(
  faction: string,
  rep: number,
): string {
  return bestUnlock(faction, rep)?.title ?? "Unknown";
}

/** Max hire discount across all factions with standing. */
export function hireDiscountFromRep(rep: RepMap): number {
  let d = 0;
  for (const [fac, n] of Object.entries(rep)) {
    const u = bestUnlock(fac, n);
    if (u?.hireDiscount && u.hireDiscount > d) {
      d = u.hireDiscount;
    }
  }
  return d;
}

export function applyHireDiscount(
  costGp: number,
  rep: RepMap,
): number {
  const d = hireDiscountFromRep(rep);
  if (d <= 0) return costGp;
  return Math.max(1, Math.floor(costGp * (1 - d)));
}

export function formatUnlocks(rep: RepMap): string[] {
  const lines: string[] = [];
  for (const fac of Object.keys(UNLOCKS)) {
    const n = rep[fac] ?? 0;
    const u = bestUnlock(fac, n);
    const next = tiersFor(fac).find((t) => t.at > n);
    lines.push(
      `  ${fac}: ${u ? u.title : "—"} (rep ${n})` +
        (next ? ` → ${next.title} @${next.at}` : " (max)"),
    );
    if (u?.summary) lines.push(`    ${u.summary}`);
  }
  return lines;
}
