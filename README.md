# UrsaMU

![ursamu header](https://raw.githubusercontent.com/ursamu/ursamu/main/ursamu_github_banner.png)

[![JSR](https://jsr.io/badges/@ursamu/ursamu)](https://jsr.io/@ursamu/ursamu)
[![Version](https://img.shields.io/badge/version-2.6.0-blue)](https://github.com/UrsaMU/ursamu/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Deno](https://img.shields.io/badge/deno-2.x-black)](https://deno.land)

A modern MUSH-like server in TypeScript/Deno. Full TinyMUX 2.x softcode
engine, sandboxed scripting in Web Workers, plugin-first architecture,
versioned REST API, and zero external database dependencies — Deno KV is
the only persistence layer.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Tasks](#tasks)
- [Plugins](#plugins)
- [Plugin Development](#plugin-development)
- [REST API](#rest-api)
- [Stdlib (v2.5.1+)](#stdlib-v251)
- [Docker](#docker)
- [Production Deployment](#production-deployment)
- [Testing](#testing)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

Prerequisite: [Deno](https://deno.land) 2.x.

```bash
# Scaffold a new game project from JSR
deno run -A jsr:@ursamu/ursamu/cli create my-game
cd my-game

# Start the supervised server (first run prompts for a superuser)
deno task start
```

Default listeners:

| Port | Protocol | Purpose |
|------|----------|---------|
| `4201` | Telnet | Legacy MU* clients |
| `4202` | WebSocket | Raw WS clients |
| `4203` | HTTP / WS | REST API + JWT WebSocket |

Connect with `telnet localhost 4201`, or point a web client at
`ws://localhost:4203?token=<jwt>&client=web`.

### From source

```bash
git clone https://github.com/UrsaMU/ursamu.git
cd ursamu
deno task start
```

---

## Features

**Engine**

- **TinyMUX 2.x softcode** — full evaluator with ~250 stdlib functions
  (math/string/list/logic/object/registers/output), action commands
  (`@switch`, `@dolist`, `@if`, `@while`, `@break`, `@trigger`, `@wait`),
  `$`-pattern command attrs and `^`-pattern listener attrs with `%0`–`%9`
  capture groups, master-room routing, zones (`@zone`).
- **Sandboxed scripting** — every script runs in an isolated Web Worker
  with the full `IUrsamuSDK`. A bad script cannot crash the server.
- **Native command surface** — 102 built-in commands (admin, building,
  comms, channels, queries, status, auth) registered via `addCmd`.
- **Zero external deps** — Deno KV is the only datastore. No Postgres,
  Redis, or Mongo.
- **Hot reload** — `@reload` swaps commands, config, scripts, and
  plugins without disconnecting players. `@reboot` and `@update` send
  `SIGUSR2` to the supervised parent for no-disconnect restarts; the
  Telnet sidecar persists and JWT clients auto-reauth.

**Plugin system (v2.6.0)**

- Manifest-driven installs with **semver-aware dependency resolution**
  (`deps[].version` supports ranges like `^1.2.0` or `>=1.0.0 <2.0.0`).
- **Fail-fast atomic installs** — a single failure anywhere in the
  manifest (unsafe name/URL, clone failure, version mismatch, conflict
  between requesters) aborts the run and rolls back every directory and
  registry mutation. Previously installed plugins are untouched.
- Typed error hierarchy: `PluginInstallError` base plus
  `PluginDepNameError`, `PluginDepUrlError`, `PluginCloneError`,
  `PluginRenameError`, `PluginVersionError`, `PluginSemverError`,
  `PluginConflictError`.
- 10 official plugins ship pre-wired; community plugins drop into
  `plugins.manifest.json`.

**Formatting pipeline (v2.3.x – v2.4.x)**

- 8 format slots: `NAMEFORMAT`, `DESCFORMAT`, `CONFORMAT`, `EXITFORMAT`,
  `WHOFORMAT`, `WHOROWFORMAT`, `PSFORMAT`, `PSROWFORMAT`, plus arbitrary
  plugin-defined `UPPERCASE` slot names.
- `registerFormatHandler` for TS handlers; **`registerFormatTemplate`**
  for raw MUSH-softcode templates (v2.4.0).
- `resolveFormat` / `resolveGlobalFormat` exposed on `u.util` for both
  TS and softcode contexts.

**Locks (v2.2.0+)**

- Boolean expressions with `&&`, `||`, `!`, parentheses (legacy `&`/`|`
  still parsed).
- **`registerLockFunc`** for custom lockfuncs alongside built-ins
  (`flag`, `attr`, `type`, `is`, `holds`, `perm`). Fail-closed parsing,
  4096-char / 256-token caps.

**Supervised game scaffold (v2.4.0+)**

- `daemon.sh` / `stop.sh` / `restart.sh` / `status.sh` driven by
  `src/cli/start.ts`. SIGUSR2 restart path keeps connections live.
- Fresh `JWT_SECRET` written to `.env` on scaffold; loaded via
  `@std/dotenv`.

**Transport & auth**

- WebSocket JWT pre-auth (`?token=<jwt>&client=web`), per-socket rate
  limit (10 cmds/sec).
- Telnet sidecar with byte-level IAC stripping (NAWS/option bytes no
  longer leak into commands).
- HTTP rate limit on `/auth/*` endpoints.
- MXP negotiation and `%mxp[cmd|text]` substitutions.

**Game systems**

- GameClock — pluggable in-game calendar with `timeMultiplier`.
- Channels — `@chancreate` / `@chandestroy` / `@chanset`, history,
  aliases, auto-join.
- Pluggable stat systems via `registerStatSystem`.
- UI manifest (`/api/v1/ui-manifest`) for web-client component
  registration.

---

## Architecture

```
src/
├── @types/          TypeScript interfaces (IDBObj, IUrsamuSDK, IPlugin, …)
├── cli/             CLI entry points (create, plugin, update, scripts, …)
├── commands/        102 built-in addCmd registrations
├── middleware/      HTTP middleware (auth, CORS, rate limiting)
├── plugins/         Official plugins + plugins.manifest.json
├── routes/          REST routers (auth, dbobj, scenes, players, config)
├── services/
│   ├── broadcast/   send() / room broadcast
│   ├── commands/    cmdParser — parse and dispatch
│   ├── Config/      Config loader + cache
│   ├── Database/    Deno KV wrapper (DBO, dbojs, events)
│   ├── DBObjs/      Object CRUD (createObj, hydrate, Obj)
│   ├── GameClock/   In-game calendar
│   ├── Hooks/       gameHooks (player:login, say, move, …)
│   ├── Intents/     Interceptors (AOP)
│   ├── jwt/         Token sign/verify
│   ├── parser/      MUSH color + substitution parser
│   ├── Queue/       Async task queue
│   ├── Sandbox/     Web Worker script execution
│   ├── SDK/         IUrsamuSDK factory
│   ├── Softcode/    TinyMUX 2.x evaluator + stdlib
│   ├── StatSystem/  Pluggable stat systems
│   ├── telnet/      Telnet sidecar
│   └── WebSocket/   WS hub (rooms, rate limit)
├── utils/           target resolution, flags, format handlers
├── app.ts           HTTP/WS dispatcher
├── main.ts          Engine init (mu)
└── telnet.ts        Telnet sidecar entry
```

### Request lifecycle

```
Player input
  → WebSocket hub (rate limit)
  → cmdParser middleware stack:
      1. Interceptors (object/room scripts)
      2. SCRIPT_NODE bypass (attached scripts)
      3. addCmd() registrations (plugin + native)
      4. registerScript overrides (local → plugin → engine)
      5. Exit matching / channel alias dispatch
  → Sandbox Worker (for scripts) receives `u` (IUrsamuSDK)
  → Result posted back, broadcast to room/socket
```

### Persistence

Everything lives in Deno KV. Each plugin gets a namespaced `DBO<T>`
instance keyed by `<plugin>.<collection>`.

```ts
const notes = new DBO<Note>("myplugin.notes");
await notes.create({ title: "Hello", body: "World" });
const all = await notes.query({});
```

---

## Configuration

A scaffolded project writes `config/config.json` and `.env` for you.
For source checkouts, copy `config.sample.json`:

```json
{
  "server": {
    "telnet": 4201,
    "ws": 4202,
    "http": 4203,
    "db": "data/ursamu.db",
    "corsOrigins": "*",
    "maxConnectionsPerIp": 20
  },
  "game": {
    "name": "My Game",
    "description": "A UrsaMU-powered MUSH.",
    "version": "0.0.1",
    "playerStart": "1",
    "timeMultiplier": 1
  }
}
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Recommended | random per restart | HMAC secret for JWT signing. Scaffolded projects write a fresh secret to `.env`. |
| `URSAMU_HTTP_PORT` | No | `4203` | Override HTTP/WS hub port. |
| `URSAMU_TELNET_PORT` | No | `4201` | Override Telnet sidecar port. |

`.env` is auto-loaded via `@std/dotenv` from `src/main.ts`.

---

## Tasks

Run with `deno task <name>`.

| Task | Description |
|------|-------------|
| `start` | First-run setup, then spawn game server + Telnet sidecar (supervised). |
| `dev` | Development mode with live logs. |
| `server` | Run game server only. |
| `telnet` | Run Telnet sidecar only. |
| `daemon` | Start both processes in background (managed restart loop). |
| `stop` / `restart` / `status` | Daemon control. |
| `logs` | Tail `logs/main.log` and `logs/telnet.log`. |
| `test` | Run the full test suite (1141+ tests). |
| `test:coverage` | Run tests with LCOV coverage. |
| `config` | Interactive configuration tool. |
| `create` | Scaffold a new game project or plugin. |
| `cli` | Interactive CLI menu. |
| `install-cli` | Install `ursamu` as a global command. |
| `docker:build` / `:up` / `:down` / `:logs` | Docker Compose lifecycle. |

CLI subcommands (`deno run -A jsr:@ursamu/ursamu/cli <subcommand>`):
`create` / `init`, `plugin list|install|update|remove|search|info`,
`update [<branch>]`, `scripts list`, `help`.

---

## Plugins

All plugins are declared in `src/plugins/plugins.manifest.json` and
installed on first startup via `ensurePlugins` — no manual steps.

| Plugin | Min Engine | Description |
|--------|-----------|-------------|
| [channel](https://github.com/UrsaMU/channel-plugin) | `>=1.9.27` | Channel system — aliases, auto-join, history. |
| [rhost-vision](https://github.com/chogan1981/ursamu-rhost-vision) | `>=1.8.0` | Rhost-style `look`, `who`, `score`, `+finger`, `+where`, `+staff`. |
| [discord](https://github.com/UrsaMU/discord-plugin) | `>=1.9.0` | Webhook Discord bridge with reconnect/backoff. |
| [jobs](https://github.com/UrsaMU/jobs-plugin) | `>=1.9.0` | Job/request tracking + REST API. |
| [events](https://github.com/UrsaMU/events-plugin) | `>=1.9.2` | In-game event calendar with RSVP + REST API. |
| [bbs](https://github.com/UrsaMU/bbs-plugin) | `>=1.9.0` | Bulletin boards — threading, IC/OOC tags, sticky posts. |
| [wiki](https://github.com/UrsaMU/wiki-plugin) | `>=1.9.0` | Markdown wiki — pages, search, history, backlinks. |
| [mail](https://github.com/UrsaMU/mail-plugin) | `>=1.9.3` | In-game mail — drafts, folders, quota, REST API. |
| [builder](https://github.com/UrsaMU/builder-plugin) | `>=1.9.5` | World-building (`@dig`, `@open`, `@link`, `@describe`, …). |
| [help](https://github.com/UrsaMU/help-plugin) | `>=1.9.0` | API-first help — file/DB/command providers. |

### Adding a community plugin

```json
{
  "name": "my-plugin",
  "url": "https://github.com/example/my-plugin",
  "ref": "v1.0.0",
  "description": "What this plugin does.",
  "ursamu": ">=2.6.0",
  "deps": [
    { "name": "jobs", "url": "https://github.com/UrsaMU/jobs-plugin", "version": "^1.9.0" },
    { "name": "channel", "url": "https://github.com/UrsaMU/channel-plugin" }
  ]
}
```

Each `deps[]` entry may include an optional `version` semver range
(e.g. `^1.2.0`, `>=1.0.0 <2.0.0`). When present, the installer reads
the dependency's own `ursamu.plugin.json` `version` and verifies the
range. Entries without `version` install unconditionally — older
manifests keep working.

**Atomic installs (v2.6.0).** `ensurePlugins` is fail-fast across the
entire manifest. If any plugin or transitive dep fails to clone, has an
unsafe name or URL, declares a version that violates a requested range,
or has conflicting ranges from multiple requesters, the entire run
aborts and rolls back. Nothing from the failed run is left on disk or
in `src/plugins/.registry.json`.

---

## Plugin Development

Scaffold a plugin inside any project:

```bash
deno run -A jsr:@ursamu/ursamu/cli create plugin my-feature
```

Generated layout:

```
src/plugins/my-feature/
├── index.ts      IPlugin lifecycle — init() and remove()
├── commands.ts   addCmd() registrations
├── router.ts     registerPluginRoute() REST endpoints
└── db.ts         DBO<T> namespaced storage
```

Minimal plugin:

```ts
import type { IPlugin } from "jsr:@ursamu/ursamu";
import { addCmd, gameHooks } from "jsr:@ursamu/ursamu";

const onLogin = (e: { id: string }) => { /* … */ };

export default {
  name: "my-feature",
  version: "1.0.0",
  description: "Example plugin.",

  init() {
    addCmd({
      name: "greet",
      pattern: /^greet\s+(.+)/i,
      category: "Social",
      help: "greet <name>  — Wave at someone.",
      exec: async (u) => {
        const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
        u.send(`You wave at ${name}.`);
        u.broadcast(`${u.util.displayName(u.me, u.me)} waves at ${name}.`);
      },
    });
    gameHooks.on("player:login", onLogin);
    return true;
  },

  remove() {
    gameHooks.off("player:login", onLogin);
  },
} satisfies IPlugin;
```

See [docs/plugins/](docs/plugins/) for the full guide including REST
routes, DB access, hooks, format handlers, lockfuncs, and publishing.

---

## REST API

The engine exposes a versioned REST API at `/api/v1/`.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/v1/auth/login` | public | Authenticate, receive a JWT. |
| `POST /api/v1/auth/connect` | public | Create + connect (scaffold). |
| `POST /api/v1/auth/logout` | token | Invalidate session. |
| `POST /api/v1/auth/reset-password` | public | Request a reset email. |
| `POST /api/v1/auth/reset/:token` | public | Submit new password. |
| `GET /api/v1/me` | token | Current player. |
| `GET /api/v1/players/online` | token | Connected players. |
| `GET /api/v1/channels` | token | List channels. |
| `GET /api/v1/channels/:id/history` | token | Channel history. |
| `GET /api/v1/dbos` | token | List DBO collections. |
| `GET\|PUT\|DELETE /api/v1/dbobj/:id` | token | Object CRUD. |
| `POST\|GET\|PUT\|DELETE /api/v1/dbobj/:id/attrs[/:name]` | token | Attribute CRUD. |
| `GET\|POST /api/v1/scenes` | token | List / create scenes. |
| `GET\|PUT\|DELETE /api/v1/scenes/:id` | token | Scene CRUD. |
| `POST\|PUT\|DELETE /api/v1/scenes/:id/pose[/:poseId]` | token | Pose CRUD. |
| `GET /api/v1/scenes/:id/export?format=markdown\|json` | token | Export scene. |
| `GET /api/v1/scenes/locations` | token | Locations with scenes. |
| `GET /api/v1/config` | public | Public config. |
| `GET /api/v1/ui-manifest` | token | Registered UI components. |

Plugin routes attach via `registerPluginRoute`. Full reference:
[docs/api/rest.md](docs/api/rest.md).

---

## Stdlib (v2.5.1+)

Math/spatial/noise/physics primitives are re-exported from `mod.ts`
for direct use in TypeScript plugins — no `npm:simplex-noise` or
`npm:alea` needed.

```ts
import {
  Rng, Noise,
  lerp, smoothstep, clamp, remap,
  dist2d, dist3d, angle2d, bearing,
  vreflect, pointInAabb, rayAabb,
  fbm2, ridged2, perlin2, simplex2, worley2,
} from "jsr:@ursamu/ursamu";

const rng = new Rng(12345);             // per-instance seedable mulberry32
const noise = new Noise(rng.next());    // per-instance Perlin/Simplex/Worley
const h = fbm2(noise, x, y, 6, 2.0, 0.5);
```

Full surface listed in [docs/api/core.md](docs/api/core.md).

---

## Docker

```bash
deno task docker:build
deno task docker:up
deno task docker:logs
deno task docker:down
```

The Compose stack mounts three volumes:

```yaml
volumes:
  - ./data:/app/data      # Deno KV database
  - ./config:/app/config  # Game configuration
  - ./logs:/app/logs      # Server logs
```

Set `JWT_SECRET` in `.env` before starting.

---

## Production Deployment

### Supervised daemon (recommended)

```bash
deno task daemon     # start
deno task status     # check
deno task logs       # tail
deno task restart    # SIGUSR2 — no-disconnect restart
deno task stop       # stop
```

The supervisor restarts the main process on exit code `75` (used by
`@reboot` and `@update`); exit `0` (`@shutdown`) stops cleanly. The
Telnet sidecar persists across `restart`/`@reboot`; JWT clients
auto-reauth.

### Nginx (TLS termination)

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4203;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Point Telnet clients directly at port `4201`.

### In-game updates

```
@update          pull origin main, SIGUSR2 restart
@update main     pull specific branch
@reboot          SIGUSR2 restart (no git pull)
@shutdown        clean stop
```

---

## Testing

```bash
deno task test
deno task test:coverage
```

Pre-commit checklist (mirrors CI):

```bash
deno check --unstable-kv mod.ts
deno lint
deno test tests/ --allow-all --unstable-kv --no-check
deno test tests/security_*.test.ts --allow-all --unstable-kv --no-check
```

1141+ tests, 0 failures; 348 files lint-clean.

---

## Documentation

| Topic | Link |
|-------|------|
| Installation | [docs/guides/installation.md](docs/guides/installation.md) |
| User guide | [docs/guides/user-guide.md](docs/guides/user-guide.md) |
| Admin guide | [docs/guides/admin-guide.md](docs/guides/admin-guide.md) |
| In-game commands | [docs/guides/commands.md](docs/guides/commands.md) |
| Scripting guide | [docs/guides/scripting.md](docs/guides/scripting.md) |
| Writing help files | [docs/guides/help-authoring.md](docs/guides/help-authoring.md) |
| CLI reference | [docs/guides/cli.md](docs/guides/cli.md) |
| Docker | [docs/guides/docker.md](docs/guides/docker.md) |
| Deployment | [docs/guides/deployment.md](docs/guides/deployment.md) |
| Plugin development | [docs/plugins/index.md](docs/plugins/index.md) |
| Official plugins | [docs/plugins/official-plugins.md](docs/plugins/official-plugins.md) |
| REST API reference | [docs/api/rest.md](docs/api/rest.md) |
| Core API | [docs/api/core.md](docs/api/core.md) |
| Testing | [docs/development/testing.md](docs/development/testing.md) |
| Architecture | [docs/about.md](docs/about.md) |

---

## Contributing

Pull requests are welcome. For major changes please open an issue first
to discuss your plan.

```bash
git clone https://github.com/YOUR-USERNAME/ursamu.git
cd ursamu
deno task test
deno task create plugin my-test-feature
```

See [docs/development/contributing.md](docs/development/contributing.md)
for coding conventions and PR process.

---

## License

MIT — see [LICENSE](LICENSE).
