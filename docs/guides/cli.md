---
layout: layout.vto
title: CLI Reference
description: Complete reference for the UrsaMU command-line interface — create projects, scaffold plugins, and manage packages.
---

# CLI Reference

The CLI ships as **`jsr:@ursamu/cli`**. No global install required —
run it with `deno run`.

Pin a known release in scripts and docs:

```bash
deno run -A jsr:@ursamu/cli@0.1.5/<export> …
```

| Export | Entry | Use |
|--------|-------|-----|
| `/create` | project + plugin scaffold | everyday |
| `/ursamu` | interactive menu | package picker, helpers |
| `/update` | bump engine import | existing games |
| `/plugin` | manifest plugin ops | git plugins |
| `/start` | supervised start helper | advanced |

---

## create

### New game project

```bash
deno run -A jsr:@ursamu/cli@0.1.5/create <project-name>
deno run -A jsr:@ursamu/cli@0.1.5/create <project-name> --local
```

Creates a directory with a supervised UrsaMU game:

- `main.ts` / telnet entry — boot `@ursamu/mush`
- `config/config.json` — ports + default portal plugins
- `deno.json` — import map + tasks
- `.env` — generated `JWT_SECRET`
- `scripts/daemon.sh` (and stop/restart/status)
- Default plugins: builder, channels, help, bbs, mail, wiki,
  **web**, **site** (`serveRoot: true`)

`--local` points imports at a monorepo checkout instead of JSR.

### In-tree plugin

```bash
deno run -A jsr:@ursamu/cli@0.1.5/create plugin <name>
```

Run from a game project root. Options:

| Flag | Effect |
|------|--------|
| `--standalone` | Separate publishable plugin repo |
| `--admin-embed` / `-A` | Staff page under `/admin/<name>/` |
| `--site-static` / `-S` | Public page at `/site/p/<name>/` |
| `--non-interactive` | CI-friendly (no prompts) |

---

## Interactive menu

```bash
deno run -A jsr:@ursamu/cli@0.1.5/ursamu
```

Create games/plugins, manage packages, update the engine, and edit
shell scripts from a simple numbered menu.

---

## plugin

Manage git-based entries in `plugins.manifest.json` (when used):

```bash
deno run -A jsr:@ursamu/cli@0.1.5/plugin list
deno run -A jsr:@ursamu/cli@0.1.5/plugin install <github-url>
deno run -A jsr:@ursamu/cli@0.1.5/plugin install <github-url> --ref v1.2.0
deno run -A jsr:@ursamu/cli@0.1.5/plugin update <name>
deno run -A jsr:@ursamu/cli@0.1.5/plugin remove <name>
deno run -A jsr:@ursamu/cli@0.1.5/plugin info <name>
deno run -A jsr:@ursamu/cli@0.1.5/plugin search <query>
```

Most new games load official packages via **JSR** in
`config.json` → `server.plugins` and the import map — prefer that for
`@ursamu/help`, `@ursamu/bbs`, `@ursamu/site`, etc.

### Install behavior

Fail-fast installs with whole-run rollback on unsafe names/URLs,
clone failures, or semver conflicts. See
[Admin Guide → Plugin Install Behavior](./admin-guide.md#plugin-install-behavior).

---

## update

Bump the engine import in an existing game:

```bash
deno run -A jsr:@ursamu/cli@0.1.5/update
deno run -A jsr:@ursamu/cli@0.1.5/update --dry-run
```

---

## scripts

```bash
deno run -A jsr:@ursamu/cli@0.1.5/scripts list
```

Lists registered script names/aliases (engine + plugins).

---

## config (game task)

Inside a scaffolded project:

```bash
deno task config
deno task config --get server.apiPort
deno task config --set game.name "My Game"
```

---

## Optional global install

```bash
deno install -Ag -n ursamu jsr:@ursamu/cli@0.1.5/ursamu
# or create only:
deno install -Ag -n ursamu-create jsr:@ursamu/cli@0.1.5/create
```

Then: `ursamu` / `ursamu-create my-game`.
