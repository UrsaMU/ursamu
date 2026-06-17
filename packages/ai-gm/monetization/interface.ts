// ─── Monetization Interfaces ──────────────────────────────────────────────────
//
// IPaymentAdapter abstracts the payment provider (Stripe, etc.) so the GM
// plugin is not hard-wired to any specific payment backend.
// NullPaymentAdapter (no-op) is the default when no provider is configured.

// ─── Plan definition ──────────────────────────────────────────────────────────

export interface ISubscriptionPlan {
  id: string;
  name: string;
  description: string;
  creditsPerMonth: number; // credits granted on renewal
  priceUsd: number; // 0 = free tier
  stripePriceId?: string; // Stripe Price ID for live integration
  features: string[]; // human-readable feature list shown in +gm/sub/plans
}

// ─── Player wallet ────────────────────────────────────────────────────────────

export interface IPlayerWallet {
  id: string; // DBO requires an id field
  playerId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  subscriptionId?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: "active" | "canceled" | "past_due" | "trialing";
  updatedAt: number;
}

// ─── Credit ledger entry ──────────────────────────────────────────────────────

export type LedgerReason =
  | "subscription_renewal"
  | "credit_purchase"
  | "oracle_use"
  | "scene_participation"
  | "admin_grant"
  | "admin_deduct"
  | "refund";

export interface ILedgerEntry {
  id: string;
  playerId: string;
  delta: number; // positive = credit in, negative = spend
  reason: LedgerReason;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

// ─── Webhook event ────────────────────────────────────────────────────────────

export type WebhookEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.deleted"
  | "payment.succeeded"
  | "payment.failed";

export interface IWebhookEvent {
  type: WebhookEventType;
  customerId: string;
  subscriptionId?: string;
  planId?: string;
  amountUsd?: number;
  metadata?: Record<string, unknown>;
}

// ─── Payment adapter interface ────────────────────────────────────────────────

export interface ICheckoutResult {
  sessionId: string;
  url: string; // redirect the player to this URL
}

export interface IPaymentAdapter {
  readonly name: string;

  /** Create a Stripe Checkout / portal session for buying credits. */
  createCreditCheckout(
    playerId: string,
    credits: number,
    priceUsd: number,
    successUrl: string,
    cancelUrl: string,
  ): Promise<ICheckoutResult>;

  /** Create a subscription checkout session for a plan. */
  createSubscriptionCheckout(
    playerId: string,
    plan: ISubscriptionPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<ICheckoutResult>;

  /** Cancel an active subscription by its provider subscription ID. */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /** Verify and parse an inbound webhook payload. Throws on invalid signature. */
  handleWebhook(
    rawBody: Uint8Array,
    signatureHeader: string,
  ): Promise<IWebhookEvent>;
}

// ─── Feature cost table ───────────────────────────────────────────────────────
// Each key is a chargeable GM action. Value is credits consumed per call.
// Defaults are intentionally cheap / zero so the plugin works free by default.

export interface IFeatureCosts {
  oracle: number; // +gm/oracle query
  move: number; // +gm/move adjudication
  roundAdjudication: number; // auto round adjudication (per player in room)
  sceneFrame: number; // +gm/scene narration
}

export const DEFAULT_FEATURE_COSTS: IFeatureCosts = {
  oracle: 1,
  move: 1,
  roundAdjudication: 0, // free by default — charge if you want
  sceneFrame: 0,
};
