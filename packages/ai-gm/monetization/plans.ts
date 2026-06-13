// ─── Subscription Plans ───────────────────────────────────────────────────────
//
// Default plan catalogue. Admins can override via +gm/config or by replacing
// the exported array at startup. Plans with priceUsd === 0 are free tiers.

import type { ISubscriptionPlan } from "./interface.ts";

export const DEFAULT_PLANS: ISubscriptionPlan[] = [
  {
    id: "free",
    name: "Observer",
    description: "Free tier — watch the story unfold.",
    creditsPerMonth: 5,
    priceUsd: 0,
    features: [
      "5 credits/month",
      "+gm/oracle (1 credit each)",
      "Scene participation",
    ],
  },
  {
    id: "player",
    name: "Player",
    description: "Monthly player subscription with credits for oracle & moves.",
    creditsPerMonth: 50,
    priceUsd: 4.99,
    features: [
      "50 credits/month",
      "+gm/oracle (1 credit each)",
      "+gm/move adjudication (1 credit each)",
      "Scene participation",
    ],
  },
  {
    id: "patron",
    name: "Patron",
    description: "Heavy storyteller subscription with priority adjudication.",
    creditsPerMonth: 200,
    priceUsd: 14.99,
    features: [
      "200 credits/month",
      "All Player features",
      "Priority adjudication queue",
      "Access to campaign journal exports",
    ],
  },
];

let _plans: ISubscriptionPlan[] = [...DEFAULT_PLANS];

export function getPlans(): ISubscriptionPlan[] {
  return [..._plans];
}

export function getPlan(id: string): ISubscriptionPlan | undefined {
  return _plans.find((p) => p.id === id);
}

export function setPlans(plans: ISubscriptionPlan[]): void {
  _plans = [...plans];
}
