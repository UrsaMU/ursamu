# UrsaMU

### The Next-Generation MU* Engine

![ursamu header](https://raw.githubusercontent.com/ursamu/ursamu/main/ursamu_github_banner.png)

[![JSR](https://jsr.io/badges/@ursamu/ursamu)](https://jsr.io/@ursamu/ursamu)
[![Version](https://img.shields.io/badge/version-2.4.0-blue)](https://github.com/UrsaMU/ursamu/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Deno](https://img.shields.io/badge/deno-2.x-black)](https://deno.land)

UrsaMU is a modern, high-performance MUSH-like server built with **TypeScript** and **Deno**. It replaces decades-old C-based MU* engines (PennMUSH, RhostMUSH, MUX2) with a fully sandboxed scripting system, a plugin-first architecture, and a clean REST API — all with zero external database dependencies.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Available Scripts](#available-scripts)
- [Official Plugins](#official-plugins)
- [Plugin Development](#plugin-development)
- [REST API](#rest-api)
- [Docker](#docker)
- [Production Deployment](#production-deployment)
- [Testing](#testing)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

> **Prerequisites:** [Deno](https://deno.land) v1.40+ must be installed.
>
> ```bash
> # Mac / Linux
> curl -fsSL https://deno.land/install.sh | sh
>
> # Windows (PowerShell)
> irm https://deno.land/install.ps1 | iex
> ```

### New game from JSR (recommended)

```bash
# Scaffold a new game project
deno run -A jsr:@ursamu/ursamu/cli create my-game
cd my-game

# Start the server (interactive first-run setup)
deno task start
```

On first run you will be prompted to create a superuser account. After that the server listens on:

| Port | Protocol | Purpose |
|------|----------|---------|
| `4201` | Telnet | Legacy MU* clients |
| `4202` | WebSocket | Web clients (raw WS) |
| `4203` | HTTP / WS | REST API + JWT WebSocket |

Connect with any Telnet client (`telnet localhost 4201`) or point a web client at `ws://localhost:4203?token=<jwt>`.

### Clone and run from source

```bash
git clone https://github.com/UrsaMU/ursamu.git
cd ursamu
deno task start
```

---

## Features

- **Plugin ecosystem** — drop a folder in `src/plugins/` and commands, REST routes, and a private DB namespace register automatically; 10 official plugins ship out of the box
- **Sandboxed scripting** — scripts run in isolated Web Workers with a full SDK (`u.db`, `u.chan`, `u.mail`, `u.events`, `u.sys`, …); a bad script cannot crash the server
- **Zero external dependencies** — Deno KV for persistence — no Postgres, Redis, or Mongo to install or configure
- **REST API** — every built-in system exposes clean JSON endpoints; plugins add their own versioned routes automatically
- **WebSocket auth** — connect via `ws://host:4203?token=<jwt>&client=web` for JWT pre-auth — no `connect name password` prompt needed for web clients
- **Telnet compatible** — classic Telnet sidecar proxies to the hub so legacy clients and bots still work
- **Tiered permissions** — flag-based access control: `player` → `builder` → `wizard` → `admin` → `superuser`
- **MXP support** — MXP negotiation and `%mxp[cmd|text]` substitutions for rich Telnet clients
- **GameClock** — pluggable in-game calendar and time system
- **TinyMUX 2.x softcode engine** — full evaluator with ~250 functions (math, string, list, logic, object, registers, output); softcode attributes flagged with `/softcode`; action commands `@switch`, `@dolist`, `@if`, `@while`, `@break`, `@trigger`, `@wait`
- **$-pattern / ^-pattern dispatch** — `$<glob>:<action>` attributes fire on command match; `^<pattern>:<action>` attributes fire as monitors; `%0`–`%9` capture groups supported
- **Zone system** — `@zone` assigns objects to a zone master; zones share `$`-pattern commands across all member objects without duplicating attributes
- **Channel admin** — `@chancreate`, `@chandestroy`, `@chanset` for in-game channel management (admin/wizard only)
- **Hot reload** — `@reload` hot-reloads commands, config, scripts, and plugins without restarting the server
- **Rate limiting** — WebSocket rate limiting (10 cmds/sec per socket) and HTTP rate limiting on auth endpoints

---

## Architecture

```
src/
├── @types/          # TypeScript interfaces (IDBObj, IUrsamuSDK, IPlugin, …)
├── cli/             # CLI tools — create, config, ursamu (JSR entry points)
├── commands/        # Core built-in commands
├── middleware/       # HTTP middleware — auth, CORS, rate limiting
├── plugins/         # Official plugins (auto-installed) + plugins.manifest.json
├── routes/          # HTTP API routers — auth, objects, scenes, config
├── services/
│   ├── broadcast/   # send() / broadcast() to sockets
│   ├── commands/    # cmdParser — input parsing & dispatch
│   ├── Config/      # Config loading & caching
│   ├── Database/    # Deno KV wrapper (DBO, dbojs)
│   ├── DBObjs/      # Game object CRUD (createObj, hydrate, Obj)
│   ├── GameClock/   # In-game calendar / time
│   ├── Hooks/       # Game lifecycle hooks (GameHooks)
│   ├── Intents/     # Intent resolution & interceptors (AOP)
│   ├── jwt/         # JWT signing & verification
│   ├── parser/      # MUSH color code & substitution parser
│   ├── Queue/       # Async task queue
│   ├── Sandbox/     # Web Worker script execution (isolated)
│   ├── SDK/         # UrsamuSDK factory — builds `u` for scripts
│   ├── Script/      # Script lifecycle
│   ├── Softcode/    # Native MUSHcode support
│   ├── StatSystem/  # Pluggable stat systems
│   ├── telnet/      # Telnet sidecar
│   └── WebSocket/   # WebSocket hub (rooms, rate limiting)
├── utils/           # target resolution, flag helpers, script loading
├── app.ts           # HTTP/WS request dispatcher (handleRequest)
├── main.ts          # Engine init (mu function)
└── telnet.ts        # Telnet sidecar entry point
```

### Request lifecycle

```
Player input
    │
    ▼
WebSocket hub (rate limit check)
    │
    ▼
cmdParser middleware stack
    ├── 1. Interceptors (AOP — room/object scripts)
    ├── 2. SCRIPT_NODE bypass (object-attached scripts)
    ├── 3. Registered addCmd() commands (plugin commands)
    ├── 4. System scripts (system/scripts/*.ts via Sandbox)
    └── 5. Exit matching / channel alias dispatch

Sandbox (Web Worker)
    ├── Script receives `u` (IUrsamuSDK)
    ├── u.send(), u.db.*, u.chan.*, u.emit(), …
    └── Result posted back → broadcast
```

### Persistence

All data is stored in **Deno KV** (embedded, zero-config). Each plugin gets a namespaced `DBO<T>` instance that prevents key collisions.

```ts
const notes = new DBO<Note>("server.notes");
await notes.create({ title: "Hello", body: "World" });
const all = await notes.query({});
```

---

## Configuration

Copy `config.sample.json` to `config/config.json` and edit:

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
    "playerStart": "1"
  }
}
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Recommended | random | Long random string for signing JWTs. If not set, a new secret is generated each restart, logging out all players. |
| `URSAMU_HTTP_PORT` | No | `4203` | Override the HTTP/WS hub port. |
| `URSAMU_TELNET_PORT` | No | `4201` | Override the Telnet sidecar port. |

Create a `.env` file in the project root (it is loaded automatically via `@std/dotenv`):

```bash
JWT_SECRET=replace-with-a-long-random-string
```

---

## Available Scripts

Run any script with `deno task <name>`.

| Task | Description |
|------|-------------|
| `start` | **Recommended.** Runs first-run setup, then spawns game server + Telnet sidecar. |
| `dev` | Development mode via `scripts/run.sh` (foreground, live logs). |
| `server` | Run game server only (no Telnet sidecar). |
| `telnet` | Run Telnet sidecar only. |
| `daemon` | Start both processes in background (managed restart loop). |
| `stop` | Stop background daemon. |
| `restart` | Restart background daemon. |
| `status` | Show daemon status and PIDs. |
| `logs` | Tail `logs/main.log` and `logs/telnet.log`. |
| `test` | Run the full test suite. |
| `test:coverage` | Run tests with LCOV coverage report. |
| `config` | Interactive configuration tool. |
| `create` | Scaffold a new game project or plugin. |
| `cli` | Open the interactive CLI menu. |
| `install-cli` | Install `ursamu` as a global CLI command. |
| `docker:build` | Build the Docker image. |
| `docker:up` | Start via Docker Compose (detached). |
| `docker:down` | Stop Docker Compose stack. |
| `docker:logs` | Tail Docker Compose logs. |

---

## Official Plugins

All plugins are declared in `src/plugins/plugins.manifest.json` and auto-installed on first startup via `ensurePlugins` — no manual steps required.

| Plugin | Min Engine | Description |
|--------|-----------|-------------|
| [**channel**](https://github.com/UrsaMU/channel-plugin) | `>=1.9.27` | Channel system — alias dispatch, auto-join, `@chancreate`/`@chandestroy`, message history |
| [**rhost-vision**](https://github.com/chogan1981/ursamu-rhost-vision) | `>=1.8.0` | Rhost-style display — `look`, `who`, `score`, `+finger`, `+where`, `+staff` |
| [**discord**](https://github.com/UrsaMU/discord-plugin) | `>=1.9.0` | Webhook-based Discord bridge — channel bridging, presence, chargen events |
| [**jobs**](https://github.com/UrsaMU/jobs-plugin) | `>=1.9.0` | Anomaly-style jobs/requests — player requests, staff commands, REST API |
| [**events**](https://github.com/UrsaMU/events-plugin) | `>=1.9.2` | In-game event calendar with RSVP tracking and REST API |
| [**bbs**](https://github.com/UrsaMU/bbs-plugin) | `>=1.9.0` | Myrddin-style bulletin boards — threading, IC/OOC tags, sticky posts, Discord hooks |
| [**wiki**](https://github.com/UrsaMU/wiki-plugin) | `>=1.9.0` | Markdown wiki — pages, search, history, backlinks |
| [**mail**](https://github.com/UrsaMU/mail-plugin) | `>=1.9.3` | In-game mail — drafts, reply/forward, folders, attachments, quota, REST API |
| [**builder**](https://github.com/UrsaMU/builder-plugin) | `>=1.9.5` | World-building commands — `@dig`, `@open`, `@link`, `@describe`, `@examine`, REST API |
| [**help**](https://github.com/UrsaMU/help-plugin) | `>=1.9.0` | API-first help system — file/DB/command providers, `+help/set`, per-plugin help dirs |

To add a community plugin, append it to `plugins.manifest.json`:

```json
{
  "name": "my-plugin",
  "url": "https://github.com/example/my-plugin",
  "ref": "v1.0.0",
  "description": "What this plugin does.",
  "ursamu": ">=1.9.0",
  "deps": [
    { "name": "jobs", "url": "https://github.com/UrsaMU/jobs-plugin", "version": "^1.9.0" },
    { "name": "channel", "url": "https://github.com/UrsaMU/channel-plugin" }
  ]
}
```

Each `deps[]` entry may include an optional `version` semver range (e.g.
`"^1.2.0"`, `">=1.0.0 <2.0.0"`). When present, the installer reads the
dependency's own `ursamu.plugin.json` `version` and verifies it satisfies
the range. Entries without `version` install unconditionally — backwards
compatible with existing manifests.

**Atomic installs.** `ensurePlugins` is fail-fast across the whole manifest:
if any plugin or transitive dep fails to clone, has an unsafe name or URL,
declares a version that violates a requested range, or has conflicting
ranges from multiple requesters, the entire install run aborts and rolls
back. Nothing from the failed run is left on disk or in
`src/plugins/.registry.json` — your previously installed plugins are
untouched.

---

## Plugin Development

Scaffold a new plugin inside any project:

```bash
deno run -A jsr:@ursamu/ursamu/cli create plugin my-feature
```

This generates four files:

```
src/plugins/my-feature/
├── index.ts      # IPlugin lifecycle — init() and remove()
├── commands.ts   # addCmd() registrations
├── router.ts     # registerPluginRoute() REST endpoints
└── db.ts         # DBO<T> namespaced storage
```

A minimal plugin:

```ts
import type { IPlugin } from "jsr:@ursamu/ursamu";
import { addCmd } from "jsr:@ursamu/ursamu";

export default {
  name: "my-feature",

  async init() {
    addCmd({
      name: "greet",
      pattern: /^greet\s+(.+)/i,
      category: "Social",
      help: "greet <name>\nSay hello to someone.",
      exec: async (u) => {
        const name = u.cmd.args[0];
        u.send(`You wave at ${name}.`);
        u.emit(`${u.me.name} waves at ${name}.`);
      },
    });
  },
} satisfies IPlugin;
```

See [docs/plugins/](docs/plugins/) for the full guide including REST routes, DB access, hooks, and publishing.

---

## REST API

The engine exposes a versioned REST API at `/api/v1/`.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/v1/auth/login` | public | Authenticate and receive a JWT |
| `POST /api/v1/auth/reset` | public | Request a password reset |
| `GET /api/v1/me` | token | Current player info |
| `GET /api/v1/players/online` | token | List of connected players |
| `GET /api/v1/channels` | token | List channels |
| `GET /api/v1/channels/:name/history` | token | Channel message history |
| `GET /api/v1/dbobj/:id` | token | Fetch a game object |
| `GET /api/v1/scenes` | token | List scenes |
| `GET /api/v1/scenes/:id/export` | token | Export scene as `?format=markdown\|json` |
| `GET /api/v1/ui-manifest` | token | Registered web UI components |
| `GET /api/v1/help` | public | Help topics index |
| `GET /api/v1/help/:topic` | public | Fetch a help topic |

Full reference: [docs/api/rest.md](docs/api/rest.md)

---

## Docker

```bash
# Build and start
deno task docker:build
deno task docker:up

# View logs
deno task docker:logs

# Stop
deno task docker:down
```

The Compose stack mounts three volumes so data persists across container restarts:

```yaml
volumes:
  - ./data:/app/data      # Deno KV database
  - ./config:/app/config  # Game configuration
  - ./logs:/app/logs      # Server logs
```

Set your JWT secret in a `.env` file before starting:

```bash
JWT_SECRET=replace-with-a-long-random-string
```

---

## Production Deployment

### Daemon mode (recommended for VPS)

```bash
# Start both game server and Telnet sidecar as background processes
bash scripts/daemon.sh

# Check status
deno task status

# Tail logs
deno task logs

# Stop
deno task stop
```

The daemon runs inside a managed restart loop. On `@reboot` or `@update` (in-game commands), the server exits with code `75` and the loop restarts it automatically. On `@shutdown`, it exits with `0` and the loop stops cleanly.

### Nginx reverse proxy (TLS termination)

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # WebSocket upgrade
    location / {
        proxy_pass http://127.0.0.1:4203;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Point Telnet clients at port `4201` directly (no proxy needed for Telnet).

### Updating from in-game

Admins and wizards can update the running server without touching the terminal:

```
@update          -- git pull origin main, then restart
@update main     -- pull a specific branch
```

---

## Testing

```bash
# Run all tests
deno task test

# With coverage
deno task test:coverage
```

The test suite covers authentication, command parsing, scripting (system scripts run in-process via `wrapScript()`), plugin lifecycle, WebSocket rate limiting, scene export, and more.

```
tests/
├── auth.test.ts
├── gameclock.test.ts
├── plugin_deps.test.ts
├── scripts_attrs.test.ts
├── scripts_comms.test.ts
├── scripts_identity.test.ts
├── scripts_world.test.ts
├── websocket_e2e.test.ts
└── … (58 total)
```

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

Pull requests are welcome. For major changes please open an issue first to discuss your ideas.

```bash
# Fork and clone
git clone https://github.com/YOUR-USERNAME/ursamu.git
cd ursamu

# Run tests before and after your changes
deno task test

# Scaffold a new plugin to test plugin APIs
deno task create plugin my-test-feature
```

See [docs/development/contributing.md](docs/development/contributing.md) for coding conventions and the PR process.

---

## License

UrsaMU is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.
