// ─── Null Payment Adapter ─────────────────────────────────────────────────────
//
// Default adapter used when no payment provider is configured.
// All operations are no-ops or throw descriptive errors.

import type {
  ICheckoutResult,
  IPaymentAdapter,
  IWebhookEvent,
} from "./interface.ts";

export const nullPaymentAdapter: IPaymentAdapter = {
  name: "null",

  createCreditCheckout(): Promise<ICheckoutResult> {
    throw new Error(
      "[GM] No payment adapter configured. Set STRIPE_SECRET_KEY to enable purchases.",
    );
  },

  createSubscriptionCheckout(): Promise<ICheckoutResult> {
    throw new Error(
      "[GM] No payment adapter configured. Set STRIPE_SECRET_KEY to enable subscriptions.",
    );
  },

  cancelSubscription(): Promise<void> {
    throw new Error("[GM] No payment adapter configured.");
  },

  handleWebhook(): Promise<IWebhookEvent> {
    throw new Error("[GM] No payment adapter configured.");
  },
};
