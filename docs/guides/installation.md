---
layout: layout.vto
title: Installation Guide
description: How to install and set up UrsaMU on your system
---

# Installation Guide

Install Deno 2.x, scaffold a game with the CLI, start the server, then
claim the first staff account on the web portal.

## Prerequisites

- [**Deno**](https://deno.land/) v2.x
- Git (optional — for cloning the monorepo or git-based plugins)

## Method 1: Scaffold from JSR (recommended)

```bash
deno run -A --minimum-dependency-age=0 jsr:@ursamu/cli@0.1.5/create my-game
cd my-game
deno task start
```

The scaffold writes a supervised game project with:

- `deno.json` — tasks (`start`, `dev`, `daemon`, …)
- `config/config.json` — ports, plugins, optional site nav
- `.env` — fresh `JWT_SECRET`
- `scripts/` — `daemon.sh`, `stop.sh`, `restart.sh`, `status.sh`
- Default **portal stack**: builder, channels, help, bbs, mail, wiki,
  `@ursamu/web` (staff), `@ursamu/site` (public FE + `/play`)

When `@ursamu/site` is selected, config sets
`plugins.site.serveRoot: true` so the public site is served at `/`.

Optional: interactive menu and package picker:

```bash
deno run -A jsr:@ursamu/cli@0.1.5/ursamu
```

Engine-dev mode (link imports to a local monorepo checkout):

```bash
deno run -A --minimum-dependency-age=0 jsr:@ursamu/cli@0.1.5/create my-game --local
```

> **Imports:** game code uses `jsr:@ursamu/mush`.

## Method 2: From the monorepo

```bash
git clone https://github.com/ursamu/ursamu.git
cd ursamu
deno run -A packages/cli/src/create.ts my-game --local
cd my-game
deno task start
```

Use this when contributing to the engine or testing unreleased packages.

## Default ports

| Port | Role |
|------|------|
| `4201` | Telnet (sidecar) |
| `4202` | WebSocket game hub |
| `4203` | HTTP — REST API, `/admin`, public site, static assets |

Override with `URSAMU_HTTP_PORT` / `URSAMU_TELNET_PORT` or edit
`config/config.json` (`server.telnet`, `server.wsPort`, `server.apiPort`).

## Connecting

### Web portal (default stack)

| URL | Purpose |
|-----|---------|
| `http://localhost:4203/` | Public site home |
| `http://localhost:4203/play` | Browser play client (sign-in) |
| `http://localhost:4203/admin/` | Staff console |
| `http://localhost:4203/wiki/` | Wiki (when installed) |

### MU* clients (Telnet)

| Client | Platform |
|--------|----------|
| [Mudlet](https://www.mudlet.org/) | Win / Mac / Linux |
| [MUSHclient](https://www.mushclient.com/) | Windows |
| [Potato](https://www.potatomushclient.com/) | Win / Mac / Linux |
| `telnet localhost 4201` | Any terminal |

### WebSocket (custom clients)

Connect to `ws://localhost:4202` (game hub) with a JWT from
`POST /api/v1/auth/login`, or use the site play client which handles
auth for you.

## First admin / superuser

With an **empty database**:

1. Prefer the web path: open `/register` (or site login → register).
2. The **first web registrant** is granted `superuser`.
3. Telnet still works: `create <name> <password>` when no players
   exist also promotes the first character.

After that, grant staff with in-game flags (`@set <player>=admin`) or
the staff console. The `superuser` flag is only auto-granted on the
empty-DB first-account flow.

## Configuration

```bash
# From a scaffolded game project
deno task config
deno task config --get server.apiPort
deno task config --set game.name "My MUSH"
```

Config lives in `config/config.json`. Common keys:

- `server.telnet` / `server.wsPort` / `server.apiPort`
- `server.plugins` — JSR package list loaded at boot
- `plugins.site` — public shell (`serveRoot`, `skin`, `nav`, …)
- `game.name`, `game.playerStart`, layout templates

See the [Configuration Guide](../configuration/).

## Running the server

```bash
deno task start     # supervised foreground (game + telnet)
deno task dev       # development / live logs
deno task daemon    # background supervisor
deno task status    # pid / health
deno task stop      # graceful shutdown
deno task restart   # SIGUSR2 no-disconnect restart
```

Production notes: [Deployment](./deployment.md).

## Next steps

- [Player Guide](./user-guide.md)
- [Admin Guide](./admin-guide.md)
- [CLI Reference](./cli.md)
- [Plugin Development](../plugins/index.md)
