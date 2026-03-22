# Discord Plugin

> Webhook-based Discord integration — mirrors job events, channel talk, player presence, and chargen activity into Discord channels.

## Commands

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `@discord/set` | `@discord/set <topic>=<url>` | admin+ | Map a webhook URL to a topic. Empty URL clears it. |
| `@discord/publicurl` | `@discord/publicurl <url>` | admin+ | Set the base URL for player avatar links. |
| `@discord/list` | `@discord/list` | admin+ | Show all configured webhooks and public URL. |
| `@discord/test` | `@discord/test <topic>` | admin+ | Send a test message to a webhook topic. |

## Topics

Configure each topic with `@discord/set <topic>=<webhook-url>`:

| Topic | When it fires |
|-------|---------------|
| `jobs` | Job created, assigned, commented (public), status/priority changed, resolved, reopened, closed, deleted |
| `presence` | Player connected / disconnected |
| `staff` | Chargen application submitted, approved, or rejected |
| `<channel>` | Any in-game channel talk (e.g. `ooc`, `pub`) — topic name = channel name |

## Events

| Event | Topic | Embed |
|-------|-------|-------|
| `job:created` | jobs | Green — title, description, bucket/priority |
| `job:assigned` | jobs | Blue — assigned-to name |
| `job:commented` | jobs | Blurple — comment text (staff-only comments suppressed) |
| `job:status-changed` | jobs | Orange — old → new status |
| `job:priority-changed` | jobs | Yellow — old → new priority |
| `job:resolved` | jobs | Teal |
| `job:reopened` | jobs | Orange |
| `job:closed` | jobs | Gray |
| `job:deleted` | jobs | Red |
| `player:login` | presence | Green — player name |
| `player:logout` | presence | Gray — player name |
| `chargen:submitted` | staff | Blue — player name |
| `chargen:approved` | staff | Green — player + reviewer name |
| `chargen:rejected` | staff | Red — player name + optional notes footer |
| `channel:message` | `<channel>` | Plain content — sender as webhook username |

## Storage

| Collection | Schema | Purpose |
|------------|--------|---------|
| `discord.config` | `{ id, webhooks: Record<string,string>, publicUrl }` | Webhook URLs and avatar base URL |

## REST Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/discord/webhooks` | staff | List configured webhooks (URLs truncated) |
| `POST` | `/api/v1/discord/webhooks` | staff | Set a webhook URL or public URL |
| `DELETE` | `/api/v1/discord/webhooks/:topic` | staff | Remove a webhook topic |
| `POST` | `/api/v1/discord/webhooks/:topic/test` | staff | Send a test message |

## Install

Already bundled in the engine. Auto-loaded from `src/plugins/discord/`.

## Configuration

Set each webhook via the in-game `@discord/set` command:

```
@discord/set jobs=https://discord.com/api/webhooks/...
@discord/set presence=https://discord.com/api/webhooks/...
@discord/set staff=https://discord.com/api/webhooks/...
@discord/set ooc=https://discord.com/api/webhooks/...
@discord/publicurl https://mygame.com
```
