# Changelog

All notable changes to UrsaMU are documented here.

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
