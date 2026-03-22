# Changelog

All notable changes to UrsaMU are documented here.

## [1.9.4] — 2026-03-22

### Breaking

- **`server.mail` DBO removed from core** — mail is now the `mail-plugin` external plugin; data in `server.mail` is not auto-migrated (export first if needed)
- **`u.mail.*` sandbox methods removed** — mail operations are now handled natively by the plugin; sandbox scripts that called `u.mail.*` will need updating

### New Plugin — mail

Mail system extracted to [UrsaMU/mail-plugin](https://github.com/UrsaMU/mail-plugin) (v1.0.0) and added to `plugins.manifest.json`. Auto-installed on next server start via `ensurePlugins`.

New capabilities beyond the original system script:
- **Soft delete** — `@mail/trash`, `@mail/restore`, `@mail/purge` (trash-then-hard-delete flow)
- **Object attachments** — `@mail/attach <object>` links game object dbrefs to a draft
- **`-<text>` command** — registered native command for appending draft body lines
- **Per-player quota** — delivery skipped for recipients at 100 messages; sender notified per skipped recipient
- **Message expiry** — set `expiresAt` on any message; plugin sweeps hourly
- **`@mailstat`** — admin command showing inbox/trash/unread totals
- **`PATCH /api/v1/mail/:id`** — update `folder` or `starred` via REST
- **`mail:received` game hook** — emitted per recipient on send; subscribe from any plugin
- **`player:login` hook** — delivers unread count and draft warning at connect time

### Core Cleanup

- `mailRouter.ts` removed from core routes (`src/routes/index.ts`, `app.ts`)
- `mail` DBO export removed from `src/services/Database/database.ts`
- `u.mail.*` removed from `src/services/Sandbox/worker.ts` and `SandboxService.ts`
- `connect.ts` — inline mail notification and broken `u.bb.totalNewCount()` reference (left over from v1.9.3) both removed
- `chargen/commands.ts` — fixed latent bug: rejection mail now uses correct `#dbref` format and includes `read: false`
- `GameHooks` — `mail:received` event added to the typed `GameHookMap`

## [1.9.0] — 2026-03-21

### New Features

#### Plugin Manifest System (`ensurePlugins`)
- `src/plugins/plugins.manifest.json` — declare external plugins with `name`, `url`, `ref`, and `ursamu` version constraint
- `src/utils/ensurePlugins.ts` — auto-clones missing manifest-declared plugins on server start; supports tag, branch, or commit-SHA pinning; writes a `.registry.json`
- `src/utils/loadPlugins.ts` — now calls `ensurePlugins()` before the directory walk
- Security guards: `isSafePluginName` (no traversal), `isSafePluginUrl` (https only), SHA-ref detection for commit pinning

#### rhost-vision Extracted to External Plugin
- Built-in `src/plugins/rhost-vision/` removed; replaced by manifest entry pointing to `chogan1981/ursamu-rhost-vision@v1.1.0`
- New `docs/plugins/rhost-vision.md` covers install and configuration

#### Public API Additions
- `send()` exported from `mod.ts` — plugins can now deliver targeted in-game messages without broadcasting
- `u.sdk.forceAs(targetId, command)` — run any command as another DB object from SDK context

#### `@reload` Improvements
- `@reload/plugin <name>` — hot-reload a single named plugin without touching commands or config
- `@reload/commands`, `@reload/config`, `@reload/scripts` switches for selective reload

#### `ursamu plugin install --ref`
- `--ref <tag|sha>` flag pins a plugin install to a specific git tag or commit SHA
- Shared with `ensurePlugins` via `buildCloneSteps()` helper

### Security

- **[HIGH] SSRF** — `@avatar` now guards private/loopback/link-local/cloud-metadata hosts by name **and** resolves DNS A/AAAA records to block DNS-rebinding attacks; `isPrivateHost()` exported for direct testing
- **[MEDIUM] Auth rate-limit** — `/auth/reset` rate-limited (shared `isLoginRateLimited` limiter); returns `429 Retry-After: 60` on excess
- **[LOW] Weak ID** — job comment IDs switched from predictable `jc-<timestamp>-<5-char random>` to `crypto.randomUUID()`
- **[LOW] ensurePlugins supply-chain** — path-traversal guard, https-only URL validation, and SHA pinning reduce plugin supply-chain risk

### Improvements

- `@set` — refactored to handle `@set <target>/<ATTR>=<value>` and `@set <target>=<FLAG> <!FLAG>` modes cleanly; docs updated
- `examine` — improved output: object type header, owner name resolution (`#id → Name (#id)`), aligned field labels
- `authRouter.ts` — TypeScript non-null assertions on reset token deletion path

### Documentation

- New guides: `docs/guides/debugging.md`, `docs/guides/gameclock.md`, `docs/guides/softcoding.md`
- New plugin docs: `docs/plugins/chargen.md`, `docs/plugins/events.md`, `docs/plugins/rhost-vision.md`
- `docs/llms.md` — machine-optimised AI reference for code generation tools
- Updated: admin-guide, scripting, sdk-cookbook, user-guide, commands ref, API index and core reference

## [1.8.0] — 2026-03-21

### New Features

#### `u.eval` — Sandbox Attribute Evaluation
- New SDK method `u.eval(targetId, attrName, args?)` — evaluate a named attribute on any DB object from within a sandbox script
- Dispatches `eval:attr` message to `SandboxService`; returns the attribute's evaluated string result

#### GameClock — In-Game Time
- `sys.gameTime()` / `sys.setGameTime(t)` — read and write the in-game clock (year, month, day, hour, minute)
- `@time` — display current game time and server UTC time
- `@time/set year=<n> month=<n> ...` — admin-only clock setter with per-field range validation

#### `parseDesc` Utility — Smart Description Parser
- `parseDesc(desc, actor, target)` — substitutes `%0` (actor display name), `%1–%9` (empty), and `[u(objId/attrName, args)]` inline attribute calls within room/object descriptions
- Capped at 10 `[u()]` patterns per description (DoS guard)
- Exposed as `u.util.parseDesc()` in the sandbox SDK

#### Chargen Plugin
- Full character-generation workflow: `+chargen`, `+chargen/set`, `+chargen/submit`, `+chargen/view`, `+chargen/approve`, `+chargen/reject`
- REST API: `GET /api/v1/chargen`, `GET /api/v1/chargen/:playerId`, `PATCH /api/v1/chargen/:playerId`
- Hook events: `chargen:submitted`, `chargen:approved`, `chargen:rejected`
- On approval: sets `approved` / removes `unapproved` flag; sends in-game mail on rejection

#### Admin Tools
- `@sweep` — list all reactive objects (with SCRIPT/LISTEN attributes) in the current room
- `@entrances` — list all exits whose destination is the current (or named) room
- Persistent channel history logging: channels now write to `logs/channels/<name>.log`

### Security

- **H1** `@sweep` — added admin/wizard/superuser guard (plain players were not blocked)
- **H2** `@entrances` — added admin/wizard/superuser guard (same fix)
- **H3** Chargen REST API — replaced `.includes()` flag check with `Set.has()` to close substring-bypass (`"notadmin"` no longer grants staff access)
- **H4** `parseDesc` IDOR — plain players can no longer embed `[u(otherObj/attr)]` in their own description to exfiltrate another object's attributes; only privileged actors (admin/wizard/superuser) may cross-reference objects
- **M1** `@time/set` — added per-field range validation (year 1–9999, month 1–12, day 1–28, hour 0–23, minute 0–59)
- **M2** `parseDesc` DoS — `[u()]` pattern count capped at 10 per description
- **M3** `+chargen/set` — field name limited to 64 chars, field value to 4096 chars
- **M4** `@force` — replaced single superuser guard with full privilege ladder; wizard cannot force an admin or peer wizard
- **M5** `@tel` — same privilege-ladder guard as `@force`; wizard cannot teleport an admin or superior
- **L1/L2** Chargen notes — `PATCH /api/v1/chargen/:id` now rejects `notes` longer than 2000 characters

## [1.7.0] — 2026-03-21

### New Features

#### `@o*` / `@a*` Attribute Messaging
- Objects now support classic MUSH message attributes: **SUCC / OSUCC / ASUCC** (pickup), **DROP / ODROP / ADROP** (drop), **SUCC / OSUCC / ASUCC** (give), and **ODESC** (look)
- Movement triggers **OLEAVE / LEAVE** (old room), **OENTER / ENTER** (new room), and **ALEAVE / AENTER** (exit owner) — all read from plain-text attributes on the relevant exit
- New SDK method: `u.attr.get(id, name)` — reads any named attribute from a DB object; available in sandbox scripts, native commands, and the `createNativeSDK` factory

#### `@listen` / `@ahear` — NPC Reactivity Hooks
- Any object in a room with a **LISTEN** attribute auto-reacts when a player speaks
- Pattern matching supports glob syntax: `*` (always), `foo*` (starts-with), `*foo` (ends-with), `*foo*` / `foo` (substring) — case-insensitive
- On match, the object's **AHEAR** attribute fires in the object's own context with `[message, actorId]` as args
- `matchListen(pattern, text)` exported from `src/utils/index.ts` for use in plugins

#### `@startup` — Boot-Time Attribute Execution
- Objects with a **STARTUP** attribute have it executed at server boot via `runStartupAttrs()`
- Restricted to **wizard / admin / superuser**-flagged objects (plain player objects are skipped)
- Fire-and-forget after Discord init; per-object errors are isolated and logged
- Enables persistent NPC behaviors, world setup scripts, and boot-time automation

#### Docker Support
- `Dockerfile` — multi-stage Deno image with dep-cache layer; ports 4201 (telnet), 4202 (WS), 4203 (HTTP)
- `docker-compose.yaml` — volumes for `data/`, `config/`, `logs/`; `restart: unless-stopped`
- `.dockerignore` — excludes tests, data, coverage, `.claude`, logs
- New tasks: `docker:build`, `docker:up`, `docker:down`, `docker:logs`

#### NAWS — Telnet Terminal Width Negotiation (RFC 1073)
- Telnet sidecar sends `IAC DO NAWS` on connect; parses `IAC SB 31` response
- Width validated to 40–250; height to 1–255
- Handles NAWS sequences split across TCP chunks via `accumulateNaws(carry, chunk)`
- Negotiated width stored as `data.termWidth` in the player's DB record
- `who` command uses `termWidth` (default 78) for the separator line

### Security

10 vulnerabilities patched via TDD audit of v1.7 features (all test-driven, Red → Green → Refactor).

#### Critical / High
- **AHEAR message truncation** — raw say message truncated at 2,000 chars before passing to `u.trigger()`; LISTEN patterns > 500 chars rejected before matching; silent `catch(_e){}` replaced with `console.warn`
- **NAWS height bounds** — `parseNawsBytes()` now validates height (1–255) in addition to width
- **`msgBuffer` cap** — `MAX_MSG_BUFFER_SIZE = 200` with oldest-entry eviction prevents heap exhaustion during WS reconnects
- **STARTUP privilege guard** — `runStartupAttrs()` skips objects without wizard / admin / superuser flag; prevents player-owned objects from running arbitrary commands at every boot

#### Medium / Low
- **WebSocket `termWidth` validation** — exported `clampTermWidth(w)` validator (40–250) gates all DB writes; rejects negative and out-of-range values sent directly via WS
- **Split-frame NAWS** — exported `accumulateNaws(carry, chunk)` correctly reassembles NAWS sequences that span TCP reads
- **`who` idle NaN guard** — `formatIdle()` adds `isNaN()` check so `NaN` lastCommand renders `"---"` instead of `"NaNs"`

### Tests
- 13 new security tests across `tests/scripts_listen.test.ts`, `tests/naws.test.ts`, `tests/startup_attrs.test.ts`, `tests/scripts_interaction.test.ts`, `tests/scripts_comms.test.ts`
- Suite: **672 passed / 0 failed**

---

## [1.6.0] — 2026-03-21

### New Features

#### Persistent Channel History
- `IChannel` gains `logHistory` (default: `false`) and `historyLimit` (default: `500`) fields
- New `server.chan_history` DB collection stores messages when logging is enabled; oldest entries trimmed to `historyLimit` automatically
- **In-game commands:**
  - `+channel/history <name>[=<lines>]` — show last N lines (default 20, max 500)
  - `+channel/transcript <name>=<lines>` — ISO-timestamped export
- **`@chanset` additions:** `log=on|off` and `historyLimit=<n>` (1–5000)
- **REST:** `GET /api/v1/channels/:id/history?limit=<n>` (auth required; 403 when logging disabled)
- **SDK:** `u.chan.history(name, limit?)` available in both native commands and sandbox scripts

### Security

19 vulnerabilities patched across two audit passes (PRs #49 and #52). All fixes are test-driven (Red→Green→Refactor).

#### Critical / High
- **Route prefix boundary** — `startsWith("/api/v1/auth")` (and config/connect/welcome) routed `/api/v1/configevil/connect` to `configHandler`, which served the connect text file. Fixed with exact+prefix matching on all routes.
- **Authorization gaps** — `@trigger` and `@open` commands missing authorization checks; `GET /api/v1/players/online` was unauthenticated.
- **Scene ownership bypass** — ownerless scene adoption in `PATCH /api/v1/scenes/:id` was unrestricted; now requires wizard/admin/superuser.
- **Git subprocess injection** — `git.init(url)` passed user input directly to `Deno.Command`. Now rejects `-`-prefixed URLs and whitespace-injected flags; adds `--` separator.
- **Unvalidated JSON → DB** — `@git/pull` wrote `JSON.parse(content)` directly to the database. New `validateGitObject()` whitelist rejects unknown fields and sensitive data keys.
- **Password reset mass assignment** — password reset wrote the full user object; now scoped to `{ data: user.data }`.

#### Medium
- **Rate-limit map exhaustion** — `loginAttempts` and `apiRateLimits` Maps had no hard size cap. Added `MAX_TRACKED_IPS = 10,000` with oldest-entry eviction on both.
- **flags substring matching** — `flags.includes("wizard")` could match partial strings; replaced with exact `hasFlag()` helper across scene, building, and player routers.
- **Input length limits** — scene name (≤200), description (≤2000), mail subject (≤200), mail body (≤10,000), building room name (≤200), building description (≤2000).
- **SandboxService full-object `$set`** — 6 handlers (`failedAttempts`, `lastLogin`, `setPassword`, `chan:join`, `chan:leave`, `bb:markRead`) wrote entire player objects back. Replaced with new `scopedUpdate()` helper using dot-notation field paths.
- **`joinChans` full-object `$set`** — now uses scoped `data.channels` write.
- **Error message leaks** — auth 500 responses, `@trigger` errors, and command parser errors no longer expose internal details to clients or players.
- **`@wait` delay cap** — capped at 3600 seconds; over-limit returns an in-game error.

#### Low
- **Wiki path traversal** — `decodeURIComponent(topic)` now blocks `..` and null bytes.
- **Mail route wiring** — `mailHandler` was exported but never registered in `app.ts`; now active under `/api/v1/mail`.
- **Scene/invite JSON try/catch** — missing error handling on pose/invite/PATCH endpoints added.

### Tests
- 24 new security tests (`tests/security_routing.test.ts`, `tests/security_git.test.ts`, `tests/security_ratelimit.test.ts`, `tests/security_sandbox_set.test.ts`, `tests/security_joinchans.test.ts`)
- Suite: **632 passed / 0 failed**

---

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
