# ai-gm — REST API

All routes are under `/api/gm`. Authenticate with:

```
Authorization: Bearer <GM_API_SECRET>
```

Leave `GM_API_SECRET` unset to run open in development.

## Endpoints

| Method | Path                        | Auth       | Description                                    |
| ------ | --------------------------- | ---------- | ---------------------------------------------- |
| `GET`  | `/api/gm/status`            | Bearer     | Health check + config summary                  |
| `GET`  | `/api/gm/sessions`          | Bearer     | List all sessions                              |
| `GET`  | `/api/gm/sessions/:id`      | Bearer     | Session detail + exchanges                     |
| `GET`  | `/api/gm/journal`           | Bearer     | Journal entries (`?limit=20`)                  |
| `GET`  | `/api/gm/journal/:id`       | Bearer     | Single journal entry                           |
| `GET`  | `/api/gm/spotlights`        | Bearer     | Spotlights (`?playerId=` `?sessionId=`)        |
| `GET`  | `/api/gm/wallets/:playerId` | Bearer     | Player wallet + balance                        |
| `GET`  | `/api/gm/plans`             | Bearer     | Subscription plan catalogue                    |
| `POST` | `/api/gm/webhook`           | Stripe sig | Stripe webhook (no bearer; signature-verified) |
| `POST` | `/api/gm/credits/grant`     | Bearer     | Admin credit grant `{ playerId, amount }`      |

## Mounting in a Host Server

```typescript
import gmPlugin from "jsr:@ursamu/ai-gm";

await gmPlugin.init();

Deno.serve(async (req) => {
  const gmResponse = await gmPlugin.handleRequest?.(req);
  if (gmResponse) return gmResponse;

  return new Response("Not found", { status: 404 });
});
```

## Error Format

All errors return JSON:

```json
{ "error": "Unauthorized" }
```

Stack traces are never exposed in error responses.
