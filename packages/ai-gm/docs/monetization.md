# ai-gm — Monetization

Credits and subscriptions are optional. The plugin works fully free out of the
box — Stripe is never required.

## Default Plans

| Plan     | Price  | Credits/month | Access                     |
| -------- | ------ | ------------- | -------------------------- |
| Observer | Free   | 5             | Basic oracle queries       |
| Player   | $4.99  | 50            | Oracle + move adjudication |
| Patron   | $14.99 | 200           | Full access + priority     |

## Default Feature Costs

| Feature           | Cost     |
| ----------------- | -------- |
| Oracle query      | 1 credit |
| Move adjudication | 1 credit |
| Session journal   | Free     |
| Scene framing     | Free     |
| Everything else   | Free     |

Costs and plans are configurable. Overrides persist in DB.

## Credit Commands

```
+gm/credits                — show your balance and recent ledger
+gm/credits/buy <n>        — purchase N credits (generates a Stripe checkout link)
+gm/credits/grant <pid> <n> — staff: grant credits to a player
```

## Subscription Commands

```
+gm/sub            — show your current subscription
+gm/sub/plans      — list available plans
+gm/sub/start <id> — subscribe (free tier: instant; paid tier: Stripe link)
+gm/sub/cancel     — cancel current subscription
```

## Stripe Setup

1. Add a webhook in your Stripe dashboard pointing to:
   ```
   https://yourgame.example.com/api/gm/webhook
   ```

2. Subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

3. Copy the webhook signing secret to `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SECRET_KEY=sk_live_...
   GAME_URL=https://yourgame.example.com
   ```

Webhook signatures are verified on every request. A missing or invalid signature
returns `400`.

## Running Without Stripe

Leave `STRIPE_SECRET_KEY` unset. The null adapter activates:

- Free subscriptions work normally
- `+gm/credits/buy` returns an informational message
- All staff grant commands still work
- The `POST /api/gm/webhook` route returns `503`

## Credits Ledger

Every credit change is appended to an immutable ledger (`gm.ledger`). Balances
are always derived from the ledger — no mutable balance field. Concurrent
`spendCredits()` calls are serialised per-player to prevent overdraft.
