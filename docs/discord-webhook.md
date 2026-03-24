# Discord Webhook Plugin Plan

## Overview

A webhook-based Discord integration plugin. Uses Discord's per-message `username`
and `avatar_url` overrides so a single webhook can post as different named players
with unique avatars. No bot account, no gateway connection — one-directional (game → Discord).

## Avatar source (priority order)

1. Player's locally-saved avatar served at `GET /avatars/:id` (see avatar system)
2. Fallback: `https://robohash.org/{encodedName}?set=set4&size=80x80` (unique per name, free)

Requires `publicUrl` in game config so the plugin can construct absolute avatar URLs.
---

## Plugin location

```
src/plugins/discord/
  index.ts              ← IPlugin entry, registers commands + hooks
  webhook.ts            ← low-level HTTP poster (queue, retry, 429 handling)
  config.ts             ← read/write webhook config from game DB config
  commands.ts           ← @discord/set, @discord/list, @discord/test
  router.ts             ← REST API for managing webhooks
  ursamu.plugin.json
```
---

## Configuration

Stored in game config under the `"discord"` key:

```json
{
  "webhooks": {
    "jobs":   "https://discord.com/api/webhooks/…/…",
    "ooc":    "https://discord.com/api/webhooks/…/…",
    "scenes": "https://discord.com/api/webhooks/…/…"
  },
  "publicUrl": "https://mygame.example.com"
}
```

`publicUrl` is used to construct `avatar_url` values for Discord.
Topics are optional — unconfigured topics are silently skipped.
---

## webhook.ts — low-level poster

```typescript
interface WebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}
```

- POST to webhook URL with `Content-Type: application/json`
- Respects Discord `429 Too Many Requests` — reads `retry_after`, waits, retries once
- Per-webhook outgoing queue (one at a time per URL) to avoid burst rate-limiting
- Silent failure on non-retryable errors (logs to console, never crashes game)
---

## In-game commands (wizard/admin only)

```
@discord/set <topic>=<url>    ← set or update a webhook URL
@discord/set <topic>=         ← clear/disable a topic
@discord/list                 ← show configured topics (URLs truncated)
@discord/test <topic>         ← post a test message to a topic
```
---

## REST API

All endpoints require staff (admin/wizard).

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/discord/webhooks | List topics (URLs truncated to 40 chars) |
| POST | /api/v1/discord/webhooks | `{ topic, url }` — set webhook |
| DELETE | /api/v1/discord/webhooks/:topic | Remove topic |
| POST | /api/v1/discord/webhooks/:topic/test | Send test message |
---

## Event → Discord mapping

### `jobs` topic — subscribes to `jobHooks`

| Hook event | Discord output |
|------------|---------------|
| `job:created` | Green embed: "New job #N — [title]" — submitter as username |
| `job:assigned` | Blue embed: "Job #N assigned to [staff]" |
| `job:commented` | Plain message as comment author (skips `staffOnly` comments) |
| `job:status-changed` | Yellow embed: status transition |
| `job:resolved` | Teal embed: "Job #N resolved by [staff]" |
| `job:closed` | Gray embed: "Job #N closed by [staff]" |
| `job:deleted` | Red embed: "Job #N deleted" |

### `ooc` topic — in-game public channel relay

Subscribe to channel talk events on channels flagged as public.
Post as the speaking player with their avatar.

Format: `content: message` (plain, no embed — keeps it readable)

### `scenes` topic — scene pose relay

Subscribe to scene pose events.
Post as the posing player with their avatar.

Format: pose text as-is (no prefix), player as username.
---

## Avatar URL resolution

```typescript
function avatarUrl(playerId: string, playerName: string, config: DiscordConfig): string {
  // Check if player has a saved avatar
  if (playerHasAvatar(playerId)) {
    return `${config.publicUrl}/avatars/${playerId}`;
  }
  // Fallback to RoboHash
  return `https://robohash.org/${encodeURIComponent(playerName)}?set=set4&size=80x80`;
}
```
---

## Message format examples

**Job created (embed):**
```json
{
  "username": "Mira",
  "avatar_url": "https://mygame.com/avatars/obj-42",
  "embeds": [{
    "color": 5763719,
    "title": "New Job #17 — Fix the north gate",
    "description": "The north gate latch is broken again.",
    "footer": { "text": "Category: maintenance • Priority: normal" }
  }]
}
```

**OOC channel message:**
```json
{
  "username": "Mira",
  "avatar_url": "https://mygame.com/avatars/obj-42",
  "content": "Anyone want to run a scene tonight?"
}
```
---

## What's NOT included (future work)

- Discord → game bridging (requires bot/gateway)
- Per-player opt-out (`@discord/optout`)
- Per-channel subscription mapping (which game channels go to which topic)
- Thread-per-scene (Discord webhook API limitation — needs a bot)
- Attachment/image forwarding from in-game
---

## Dependencies

- Avatar system (`src/commands/avatar.ts` + `/avatars/:id` route) — must exist first
- `jobHooks` from `src/plugins/jobs/hooks.ts`
- Game config system (`getConfig` / `setConfig`)
- `publicUrl` configured in game config
