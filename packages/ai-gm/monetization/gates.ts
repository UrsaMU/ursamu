// ─── Feature Gates ────────────────────────────────────────────────────────────
//
// Guards that check whether a player can use a GM feature.
// When monetization is disabled (costs all 0), every gate passes.
// When a player has insufficient credits, the gate returns an error string.

import { canAfford, spendCredits } from "./credits.ts";
import type { LedgerReason } from "./interface.ts";
import { DEFAULT_FEATURE_COSTS } from "./interface.ts";

// Allow run-time cost overrides (future: store in DB config)
let _costs = { ...DEFAULT_FEATURE_COSTS };

export function setFeatureCosts(
  overrides: Partial<typeof DEFAULT_FEATURE_COSTS>,
): void {
  _costs = { ..._costs, ...overrides };
}

export function getFeatureCosts() {
  return { ..._costs };
}

// ─── Gate check (no spend) ────────────────────────────────────────────────────

export async function checkGate(
  playerId: string,
  feature: keyof typeof DEFAULT_FEATURE_COSTS,
): Promise<true | string> {
  const cost = _costs[feature];
  if (cost <= 0) return true;
  const ok = await canAfford(playerId, cost);
  return ok ? true : insufficientMsg(feature, cost);
}

// ─── Gate + spend (call on confirmed action) ──────────────────────────────────

export async function chargeGate(
  playerId: string,
  feature: keyof typeof DEFAULT_FEATURE_COSTS,
  metadata?: Record<string, unknown>,
): Promise<true | string> {
  const cost = _costs[feature];
  if (cost <= 0) return true;
  const reason = featureToReason(feature);
  const ok = await spendCredits(playerId, cost, reason, metadata);
  return ok ? true : insufficientMsg(feature, cost);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function featureToReason(
  feature: keyof typeof DEFAULT_FEATURE_COSTS,
): LedgerReason {
  if (feature === "oracle") return "oracle_use";
  return "scene_participation";
}

function insufficientMsg(
  feature: keyof typeof DEFAULT_FEATURE_COSTS,
  cost: number,
): string {
  return `[AI-GM] Insufficient credits. ${feature} costs ${cost} credit(s). ` +
    `Use +gm/credits to check your balance or +gm/credits/buy to top up.`;
}
