# UrsaMU
[![tdd-audit](https://img.shields.io/badge/tdd--audit-passing-brightgreen)](https://www.npmjs.com/package/@lhi/tdd-audit) <!-- tdd-audit-badge -->

![ursamu header](https://raw.githubusercontent.com/ursamu/ursamu/main/ursamu_github_banner.png)

[![JSR](https://jsr.io/badges/@ursamu/mush)](https://jsr.io/@ursamu/mush)
[![CLI](https://img.shields.io/badge/cli-0.1.5-blue)](https://jsr.io/@ursamu/cli)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Deno](https://img.shields.io/badge/deno-2.x-black)](https://deno.land)

A TypeScript/Deno MUSH server. You scaffold a **game project**, pin the
engine from JSR, and run it. TinyMUX-style softcode, a public site,
staff console, and `/play` are included.

Need Deno 2.x: <https://deno.land>

---

## Make a game

```bash
deno run -A --minimum-dependency-age=0 \
  jsr:@ursamu/cli@0.1.5/create my-game
cd my-game
deno task start
```

`--minimum-dependency-age=0` allows brand-new JSR
publishes (Deno defaults to a 24h gate). New games pin
`@ursamu/mush@1.0.38` and `@ursamu/core@1.0.5`.

| Open this | What it is |
|-----------|------------|
| <http://localhost:4203/> | Public site |
| <http://localhost:4203/play> | Browser client |
| <http://localhost:4203/admin/> | Staff console |
| `telnet localhost 4201` | Classic MU* client |

Port `4202` is the WebSocket hub. Do not open it in a browser.

**First character:** on telnet, type
`create <name> <password>`. The first player becomes superuser.

Day-to-day in that game folder:

```bash
deno task start      # foreground
deno task daemon     # background
deno task status
deno task stop
```

More: [docs/guides/installation.md](docs/guides/installation.md),
[docs/guides/cli.md](docs/guides/cli.md).

---

## What you get

A new game is a small folder (`config/`, `src/`, `scripts/`, `.env`)
that imports the engine. Default plugins: help, channels, builder, bbs,
mail, wiki, staff web, public site.

| Package | Role |
|---------|------|
| `@ursamu/mush` | Engine (world, commands, softcode) |
| `@ursamu/core` | Transports + database |
| `@ursamu/cli` | `create` / `plugin` / `update` |
| `@ursamu/site` | Public site + `/play` |
| `@ursamu/web` | Staff console at `/admin/` |

Games import `jsr:@ursamu/mush`.

Official plugins and TTRPG systems live under `packages/` and publish
as `@ursamu/*`. Catalog:
[docs/plugins/official-plugins.md](docs/plugins/official-plugins.md).

---

## Work on the engine

This repo is the monorepo, not a playable game. Scaffold a **local**
game that points at the checkout:

```bash
git clone https://github.com/UrsaMU/ursamu.git
cd ursamu
deno run -A packages/cli/src/create.ts my-game --local
cd my-game && deno task start
```

```bash
deno task test
deno lint
```

Contributing:
[docs/development/contributing.md](docs/development/contributing.md).

---

## Docs

| I want to… | Read |
|------------|------|
| Install / first hour | [installation](docs/guides/installation.md) |
| Run or deploy | [deployment](docs/guides/deployment.md) |
| Write a plugin | [plugins](docs/plugins/index.md) |
| Use the REST API | [REST](docs/api/rest.md) |
| Theme the public site | [site design](packages/site/design.md) |
| Theme staff `/admin` | [web design](packages/web/design.md) |
| All guides | [docs/](docs/) |

---

## License

MIT — [LICENSE](LICENSE).
