# @ursamu/events

**Version 0.2.0** — in-game event calendar with RSVP tracking and REST.

```ts
import eventsPlugin, {
  eventHooks,
  gameEvents,
  parseDateTime,
} from "@ursamu/events";
```

## Install

```json
{
  "imports": {
    "@ursamu/events": "jsr:@ursamu/events@^0.2.0"
  }
}
```

```json
{
  "server": {
    "plugins": ["@ursamu/events"]
  }
}
```

## Peer dependencies

| Package | Role |
|---------|------|
| `@ursamu/mush` `^1.0.0` | Engine (`addCmd`, DBO, routes) |
| `@ursamu/help` `^1.0.0` | Help directory registration |

## Commands

| Command | Description |
|---------|-------------|
| `+event` / `+events` | List calendar |
| `+event/view <#>` | Details + RSVPs |
| `+event/rsvp <#>` | RSVP (attending / maybe / decline) |
| `+event/unrsvp <#>` | Cancel RSVP |
| `+event/create …` | Staff: create event |
| `+event/edit …` | Staff: edit fields |
| `+event/status …` | Staff: set status |
| `+event/cancel <#>` | Staff: cancel |
| `+event/delete <#>` | Staff: hard delete |

## Lifecycle hooks

```ts
import { eventHooks } from "@ursamu/events";

eventHooks.on("event:created", (ev) => { /* … */ });
eventHooks.on("event:updated", (ev) => { /* … */ });
eventHooks.on("event:cancelled", (ev) => { /* … */ });
eventHooks.on("event:completed", (ev) => { /* … */ });
eventHooks.on("event:deleted", (ev) => { /* … */ });
eventHooks.on("event:rsvp", (ev, rsvp) => { /* … */ });
eventHooks.on("event:rsvp-cancelled", (ev, rsvp) => { /* … */ });
```

Hooks fire from both in-game commands and REST mutations.

## REST (`/api/v1/events`)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v1/events` | List (`status`, `tag`, `from`, `to`, `limit`, `offset`) |
| GET | `/api/v1/events/upcoming` | Upcoming/active from now |
| POST | `/api/v1/events` | Create (staff) |
| GET | `/api/v1/events/:id` | Detail + RSVP summary |
| PATCH | `/api/v1/events/:id` | Update (staff) |
| DELETE | `/api/v1/events/:id` | Delete + RSVPs (staff) |
| GET | `/api/v1/events/:id/rsvps` | Roster |
| POST | `/api/v1/events/:id/rsvp` | Create/update RSVP |
| DELETE | `/api/v1/events/:id/rsvp` | Cancel own RSVP |

`:id` may be sequential number or internal `ev-N` id.

## Stable exports

| Export | Purpose |
|--------|---------|
| `eventsPlugin` / default | `IPlugin` bootstrap |
| `IGameEvent`, `IEventRSVP` | Domain types |
| `gameEvents`, `eventRsvps` | DBO collections |
| `parseDateTime`, `formatDateTime` | Time helpers |
| `eventHooks` | Typed lifecycle bus |
| Service API | `createEvent`, `upsertRsvp`, `listEvents`, … |
| Pure helpers | capacity, filters, parse create/edit |
| Staff bridges | nav + `events:upcoming` badge |
| Scene hints | `onEventSceneHint` |

## Peers

| Package | Role |
|---------|------|
| `@ursamu/web` | Staff tab `/admin/events` (optional) |
| `@ursamu/discord` | Webhooks on `events` channel key (optional) |
| `@ursamu/scene` | Consume `eventHooks` / scene hints (optional) |

## Tests

```bash
# Unit (memory DBO, no game)
deno task test

# Live mock game + Playwright admin UI + REST E2E
deno task e2e
```

E2E uses `games/events-local` (ports 4391–4393): boots a clean DB, registers
superuser `e2egod`, exercises REST capacity/cancel paths, and drives the staff
console create → active → cancel flow in Chromium.

```bash
# Keep the mock game running after tests
EVENTS_E2E_KEEP=1 deno task e2e
```

## License

MIT
