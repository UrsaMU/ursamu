# ai-gm — Configuration

All secrets live in a `.env` file. Copy the example and fill in your values:

```bash
cp .env.example .env
```

`.env` is gitignored — secrets never touch the database or in-game commands.

## Environment Variables

| Variable                | Required | Default                 | Purpose                                           |
| ----------------------- | -------- | ----------------------- | ------------------------------------------------- |
| `GOOGLE_API_KEY`        | **Yes**  | —                       | Google Gemini API key                             |
| `STRIPE_SECRET_KEY`     | No       | —                       | Enables Stripe payments                           |
| `STRIPE_WEBHOOK_SECRET` | No       | —                       | Stripe webhook signature secret                   |
| `DISCORD_WEBHOOK_URL`   | No       | —                       | Mirror GM output to a Discord channel             |
| `GM_API_SECRET`         | No       | _(open)_                | Bearer token for the REST API; leave unset in dev |
| `GAME_URL`              | No       | —                       | Base URL for Stripe payment redirect links        |
| `WIKI_BASE_URL`         | No       | `http://localhost:4201` | Base URL for wiki lore tools                      |

## In-Game Configuration

Runtime settings are stored in the DB and changed via in-game commands:

```
+gm/config                          — show all current settings
+gm/config/model <model>            — e.g. gemini-1.5-flash-latest
+gm/config/mode <auto|hybrid>       — auto: responds every round; hybrid: staff-triggered
+gm/config/chaos <1–9>              — Mythic GME chaos factor
+gm/config/system <id>              — active game system (see game-systems.md)
+gm/config/chars <collection>       — DBO collection the GM reads for character sheets
+gm/config/booksdir <path>          — folder the watcher monitors for game books
```

Changes take effect immediately without a restart.

### Character Sheet Collection

The GM reads approved character sheets from a configurable DBO collection. The
default is `server.playbooks` (Urban Shadows). Switch it to match your chargen
plugin's collection:

```
+gm/config/chars shadowrun.chars    — Shadowrun 4E (shadowrun-plugin)
+gm/config/chars server.playbooks   — Urban Shadows (default)
+gm/config/chars mygame.sheets      — any custom chargen plugin
```

Collection names must be lowercase alphanumeric segments separated by dots.

When you switch game systems with `+gm/config/system`, the collection is updated
automatically if the new system declares one. Use `+gm/config/chars` to override
it explicitly.

#### Custom chargen plugin contract

For the GM to read your character sheets correctly, each record in your
collection must include:

| Field                          | Type                      | Purpose                                           |
| ------------------------------ | ------------------------- | ------------------------------------------------- |
| `id`                           | `string`                  | Record ID                                         |
| `playerId`                     | `string`                  | Owner's UrsaMU player ID                          |
| `name`                         | `string`                  | Character display name                            |
| `status` **or** `chargenState` | `string`                  | Must be `"approved"` to be visible to the GM      |
| `attrs`                        | `Record<string, number>`  | **SR4-style** named attributes (Body, Agility, …) |
| `data`                         | `Record<string, unknown>` | **Generic-style** flat stat map                   |

Exactly one of `attrs` or `data` is needed. If neither is present the GM uses a
generic formatter that renders all top-level scalar fields.

## Watched Rooms

The GM only responds to activity in rooms on the watch list:

```
+gm/watch       — add current room
+gm/unwatch     — remove current room
```

Rooms not on the watch list receive no GM attention, allowing you to have OOC
spaces.
