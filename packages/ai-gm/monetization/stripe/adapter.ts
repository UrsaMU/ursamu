// ─── Stripe Payment Adapter ───────────────────────────────────────────────────
//
// Implements IPaymentAdapter using the Stripe Node SDK.
// Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars.
//
// Credit purchase flow:
//   player triggers +gm/credits/buy → createCreditCheckout → Stripe Checkout URL
//   player pays → Stripe fires webhook → handleWebhook → creditPlayer()
//
// Subscription flow:
//   player triggers +gm/sub/start <plan> → createSubscriptionCheckout → URL
//   payment succeeds → webhook → updateSubscriptionStatus + creditPlayer

import Stripe from "stripe";
import type {
  ICheckoutResult,
  IPaymentAdapter,
  IWebhookEvent,
} from "../interface.ts";

export function createStripeAdapter(
  secretKey: string,
  webhookSecret: string,
): IPaymentAdapter {
  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

  return {
    name: "stripe",

    async createCreditCheckout(
      playerId,
      credits,
      priceUsd,
      successUrl,
      cancelUrl,
    ): Promise<ICheckoutResult> {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Math.round(priceUsd * 100), // cents
              product_data: {
                name: `${credits} GM Credit${credits !== 1 ? "s" : ""}`,
                description:
                  `Credits for AI-GM features (oracle, moves, scenes)`,
              },
            },
          },
        ],
        metadata: {
          type: "credit_purchase",
          playerId,
          credits: String(credits),
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      return { sessionId: session.id, url: session.url! };
    },

    async createSubscriptionCheckout(
      playerId,
      plan,
      successUrl,
      cancelUrl,
    ): Promise<ICheckoutResult> {
      if (!plan.stripePriceId) {
        throw new Error(
          `Plan "${plan.id}" has no Stripe Price ID configured.`,
        );
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        metadata: {
          type: "subscription",
          playerId,
          planId: plan.id,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      return { sessionId: session.id, url: session.url! };
    },

    async cancelSubscription(subscriptionId): Promise<void> {
      await stripe.subscriptions.cancel(subscriptionId);
    },

    async handleWebhook(rawBody, signatureHeader): Promise<IWebhookEvent> {
      let event: Stripe.Event;
      await Promise.resolve();
      try {
        // Stripe accepts the raw body as a string for signature verification
        const body = new TextDecoder().decode(rawBody);
        event = stripe.webhooks.constructEvent(
          body,
          signatureHeader,
          webhookSecret,
        );
      } catch {
        throw new Error("Stripe webhook signature verification failed.");
      }

      const obj = event.data.object as unknown as Record<string, unknown>;

      switch (event.type) {
        case "checkout.session.completed": {
          const meta = (obj.metadata ?? {}) as Record<string, string>;
          if (meta.type === "credit_purchase") {
            return {
              type: "payment.succeeded",
              customerId: String(obj.customer ?? meta.playerId),
              metadata: {
                playerId: meta.playerId,
                credits: Number(meta.credits),
              },
            };
          }
          // subscription checkout
          return {
            type: "subscription.created",
            customerId: String(obj.customer),
            subscriptionId: String(obj.subscription),
            planId: meta.planId,
            metadata: { playerId: meta.playerId },
          };
        }

        case "customer.subscription.updated":
          return {
            type: "subscription.updated",
            customerId: String(obj.customer),
            subscriptionId: String(obj.id),
            planId: extractPlanId(obj),
          };

        case "customer.subscription.deleted":
          return {
            type: "subscription.deleted",
            customerId: String(obj.customer),
            subscriptionId: String(obj.id),
          };

        case "invoice.payment_succeeded": {
          const subId = String(obj.subscription ?? "");
          return {
            type: "payment.succeeded",
            customerId: String(obj.customer),
            subscriptionId: subId || undefined,
            amountUsd: Number(obj.amount_paid ?? 0) / 100,
          };
        }

        case "invoice.payment_failed":
          return {
            type: "payment.failed",
            customerId: String(obj.customer),
            subscriptionId: String(obj.subscription ?? ""),
          };

        default:
          // Unknown event — return a benign no-op
          return {
            type: "payment.succeeded",
            customerId: "",
            metadata: { ignored: true, stripeType: event.type },
          };
      }
    },
  };
}

// ─── Factory: build adapter from env or return null ───────────────────────────

export function createStripeAdapterFromEnv():
  | import("../interface.ts").IPaymentAdapter
  | null {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secretKey || !webhookSecret) return null;
  return createStripeAdapter(secretKey, webhookSecret);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractPlanId(sub: Record<string, unknown>): string | undefined {
  const items = sub.items as
    | { data?: Array<{ price?: { id?: string } }> }
    | undefined;
  return items?.data?.[0]?.price?.id;
}
