/**
 * Rank-based capacity for role operations (markets, chopshop queue, etc.)
 */

/** Total market "points" a Fixer can have active at once. */
export function fixerMarketCapacity(rank: number): number {
  if (rank >= 9) return 3;
  if (rank >= 7) return 2;
  if (rank >= 5) return 1;
  return 0;
}

/** Point cost for opening a market by tier. */
export function marketTierCost(tier: "night" | "midnight"): number {
  return tier === "midnight" ? 2 : 1;
}

/** Total chopshop queue slots a Medtech can have active at once. */
export function medtechQueueCapacity(rank: number): number {
  if (rank >= 9) return 4;
  if (rank >= 7) return 3;
  if (rank >= 4) return 2;
  return 1;
}

/** Queue slot cost per install type. */
export function chopshopSlotCost(installType: string): number {
  return installType === "hospital" ? 2 : 1;
}

/**
 * Milliseconds per SP point to restore, based on Tech rank.
 * Higher rank = faster repairs.
 */
export function techRepairSpeed(rank: number): number {
  if (rank >= 10) return 1 * 60 * 60 * 1000;
  if (rank >= 7)  return 2 * 60 * 60 * 1000;
  if (rank >= 4)  return 4 * 60 * 60 * 1000;
  return 8 * 60 * 60 * 1000;
}
