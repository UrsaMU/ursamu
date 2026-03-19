# Changelog

All notable changes to UrsaMU are documented here.

## [1.5.0] — 2026-03-18

### New Features

#### GameHooks — typed engine-level event bus
- `gameHooks.on(event, handler)` / `.off()` / `.emit()` — subscribe to game lifecycle events from any plugin without modifying core command files
- **Player events:** `player:say`, `player:pose`, `player:page`, `player:move`, `player:login`, `player:logout`
- **Scene events:** `scene:created`, `scene:pose`, `scene:set`, `scene:title`, `scene:clear`
- **Channel events:** `channel:message`
- All events fire with fully-typed payloads (`SayEvent`, `PoseEvent`, `SceneSetEvent`, etc.)
- Duplicate handler prevention — registering the same function twice is a no-op
- Error isolation — a throwing handler does not prevent subsequent handlers from running
- Exported from `mod.ts` so plugin authors can subscribe without any internal imports

#### Scene Hooks
- `scene:created` — fires when a new scene is opened (POST `/api/v1/scenes`)
- `scene:pose` — fires on every pose posted to a scene (pose, ooc, set)
- `scene:set` — fires additionally when a `type: "set"` pose is posted (the GM description hook)
- `scene:title` — fires when a PATCH changes the scene name
- `scene:clear` — fires when a PATCH transitions status to `"closed"`, `"finished"`, or `"archived"`

#### Wiki Plugin (`src/plugins/wiki/`)
- File-based markdown wiki with folder-driven routing (mirrors Next.js router conventions)
- YAML frontmatter support (`title`, `date`, `author`, `tags`, and arbitrary keys)
- **REST API** (`/api/v1/wiki`): `GET` list/read/search, `POST` create, `PATCH` update, `DELETE` remove, `PUT` upload static assets
- **In-game commands:** `+wiki [path]`, `+wiki/search <query>`, `@wiki/create`, `@wiki/edit`, `@wiki/fetch`
- Static asset co-location — images and PDFs live alongside articles and are served by the wiki router
- WikiHooks (`wiki:created`, `wiki:edited`, `wiki:deleted`) for plugin-level reactions
- Exported from `src/plugins/wiki/mod.ts`

#### EventHooks (`src/plugins/events/hooks.ts`)
- Typed hook bus for the events plugin — same pattern as GameHooks
- Events: `event:created`, `event:updated`, `event:deleted`, `event:started`, `event:ended`, `event:rsvp`, `event:cancelled`

#### `@update` command + daemon restart loop
- `@update [branch]` / `@upgrade [branch]` — admin-only in-game command; runs `git pull origin <branch>` and exits with code 75 to signal the restart loop
- `u.sys.update(branch?)` added to the sandbox SDK
- `scripts/main-loop.sh` — restart loop: exit 75 → restart with exponential backoff; exit 0 → clean stop; any other exit → stop (investigate logs)
- Rapid-restart protection: if the server exits in under 5 seconds the delay doubles (1 s → 2 s → … → 60 s cap)
- `scripts/daemon.sh` / `scripts/stop.sh` / `scripts/restart.sh` updated to use the loop

### Security

- **SSRF guard** — `@wiki/fetch` blocks private/loopback/link-local IP ranges before fetching
- **TOCTOU fix** — wiki page creation uses `Deno.open({ createNew: true })` for atomic create (no stat-then-write race)
- **Body size limits** — POST and PATCH wiki routes check `Content-Length` before buffering
- **Metadata key validation** — wiki frontmatter keys restricted to `/^[\w-]+$/`
- **Git option injection prevention** — `@update` branch validated against `/^[\w./\-]+$/`; names starting with `-` are rejected
- **Duplicate hook deduplication** — `gameHooks.on` is idempotent

### Tests

- **588 passing / 0 failing** (up from 450)
- New test files: `tests/game_hooks.test.ts`, `tests/scene_hooks.test.ts`, `tests/events_hooks.test.ts`, `tests/wiki_hooks.test.ts`, `tests/wiki_router.test.ts`, `tests/wiki.test.ts`, `tests/update_script.test.ts`

---

## [1.3.0] — 2026-03-16

### Breaking Changes

- **Plugin command API unified with sandbox SDK** — `ICmd.exec` signature changed from `(ctx: IContext, args: string[])` to `(u: IUrsamuSDK)`. All plugin commands now receive the same `IUrsamuSDK` object that sandbox scripts receive.

  **Before:**
  ```typescript
  exec: (ctx, args) => {
    const target = args[0]?.trim();
    ctx.socket.send(target);
  }
  ```
  **After:**
  ```typescript
  exec: (u: IUrsamuSDK) => {
    const target = u.cmd.args[0]?.trim();
    u.send(target);
  }
  ```

### New

- **`createNativeSDK(socketId, actorId, cmd)`** — factory function in `src/services/SDK/index.ts` that builds a full `IUrsamuSDK` from native services for use in the command pipeline.
- **`IUrsamuSDK.canEdit`** now returns `Promise<boolean>` (was `boolean`).
- Plugin commands can now use all SDK capabilities: `u.force()`, `u.setFlags()`, `u.teleport()`, `u.db.*`, `u.chan.*`, `u.sys.*`, `u.auth.*`, `u.util.*`, etc.

### Migration Guide

Update any `addCmd` calls:

| Old | New |
|-----|-----|
| `exec: (ctx, args) =>` | `exec: (u: IUrsamuSDK) =>` |
| `args[0]` | `u.cmd.args[0]` |
| `ctx.socket.send(msg)` | `u.send(msg)` |
| `ctx.socket.cid` | `u.me.id` |
| `ctx.socket.id` | `u.socketId` |

---

## [1.0.0] — 2026-03-16

First stable release.

### Core Systems

- **WebSocket hub** with per-socket rate limiting (10 cmd/sec, exponential backoff logging)
- **Telnet sidecar** — proxies classic MU* client connections to the WebSocket hub
- **Command parser** with middleware pipeline, flag-gated commands, and switch support
- **Sandbox scripting** — TypeScript/JS scripts run in isolated Web Workers with the `u` SDK
- **Deno KV database** via `dbojs` for game objects, channels, mail, bulletin boards, and counters
- **Discord bridge** with exponential-backoff reconnect and idempotent initialization

### Player Commands

`look`, `say`/`"`, `pose`/`:`, `page`, `who`, `score`, `inventory`, `get`, `drop`, `give`, `home`, `teleport`, `examine`, `@desc`, `@name`, `@moniker`, `quit`, `help`

### Building Commands

`@dig`, `@open`, `@link`, `@unlink`, `@create`, `@destroy`, `@clone`, `@parent`, `@lock`, `@set`

### Channel System

`@channel/list`, `@channel/join`, `@channel/leave`, channel alias messaging; admin commands `@chancreate`, `@chandestroy`, `@chanset`

### Admin Commands

`@boot`, `@toad`, `@newpassword`, `@chown`, `@reboot`, `@shutdown`, `@moniker`

### Permission System

Flag-based: `player`, `admin`, `wizard` (superuser-locked, level 9). `@set` for runtime flag management.

### Sandbox SDK (`u`)

`u.emit` (send/broadcast/broadcastExcept), `u.db` (get/search/modify/create/destroy), `u.move`, `u.chan` (send/create/destroy/set), `u.ui.layout`, `u.auth` (verify/login/hash/setPassword), `u.sys` (reboot/shutdown), `u.util` (stripSubs/center/ljust/rjust/sprintf/template/displayName)

### Web Client

Deno Fresh browser client with terminal interface, scene builder, character sheet, profile, player directory, and wiki pages (`src/web-client/`).

### Scene Archive

REST endpoint `GET /api/v1/scenes/:id/export?format=markdown|json` for exporting roleplay logs.

### Developer Experience

- `deno task init` (or `dx jsr:@ursamu/ursamu init`) — interactive project wizard with `make-wizard` bootstrap script
- `deno task test` — 296 passing tests, 0 failures
- Docker + `docker-compose.yaml` support
- JSR package: `jsr:@ursamu/ursamu`

### Bug Fixes (pre-1.0)

- `@dig` regex fixed to match plain room names without `/switch` prefix
- `target.ts` now searches actor's inventory in addition to the current room
- `SDKObject` missing `location` field added
- `name.ts` / `moniker.ts` DB patch corrected from dot-notation to nested object form
- `db:search` now includes the `name` field from `data.name` in results
- Discord bridge no longer leaks event listeners on reconnect
- `sceneRouter` PATCH adopts ownerless scenes instead of returning 403
- `sceneRouter` POST `/pose` returns 400 when `msg` is missing
- WebSocket mock socket stubs added to Queue tests
