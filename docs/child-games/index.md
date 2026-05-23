---
layout: layout.vto
description: Scaffold and run a derived game project on top of UrsaMU
---

# Child Games

A "child game" is a standalone project that uses `@ursamu/ursamu` as a
library — your own config, plugins, system-script overrides, and (usually)
your own deployment.

## Scaffold

The CLI ships with a generator that lays down a complete supervised
project, including daemon scripts, telnet sidecar, and a `.env` with a
fresh JWT secret (v2.4.0):

```bash
deno run -A jsr:@ursamu/ursamu/cli create my-game
cd my-game
```

The scaffold writes:

- `deno.json` with `start` / `dev` / `test` tasks
- `config/config.json` (see "Configuration" below)
- `plugins.manifest.json` — declared plugin dependencies
- `system/scripts/` — empty, ready for local script overrides
- `daemon.sh`, `stop.sh`, `restart.sh`, `status.sh` — supervised lifecycle
- `.env` containing a generated `JWT_SECRET`

A `--local` variant points the import map at a checkout of the engine
instead of JSR; the tasks, manifest, and scripts are otherwise identical.

## Running the game

```bash
./daemon.sh    # start under supervisor (background)
./status.sh    # show pid / uptime / health
./restart.sh   # SIGUSR2 → no-disconnect main restart; telnet sidecar persists
./stop.sh      # graceful shutdown
```

Or run in the foreground:

```bash
deno task start   # initializes config, ensures superuser, spawns server + telnet
deno task dev     # same, with hot reload
```

In-game `@reboot` issues the same SIGUSR2 as `restart.sh`. JWTs are
re-authenticated automatically; the telnet sidecar stays connected across
restarts.

## Configuration

`config/config.json` controls server ports, KV prefixes, game identity,
theme, and per-plugin scoped config. The shape:

- `server` — telnet / ws / http ports plus KV prefixes (`db`, `channels`,
  `mail`, `wiki`, `bboard`, `counters`)
- `game` — `name`, `description`, `version`, `playerStart`, text paths,
  `timeMultiplier`
- `theme` — color tokens, glass values, `backgroundImage`
- `plugins` — per-plugin scoped config

`.env` is loaded via `dotenv/load` at the top of the entry point. The only
required variable is `JWT_SECRET`. Rotate it by replacing the value and
restarting; existing tokens are invalidated.

## Plugins

External plugins are declared in `plugins.manifest.json` and resolved on
startup by `ensurePlugins`. Each entry:

```json
{
  "name": "@ursamu/help-plugin",
  "url": "https://github.com/UrsaMU/help-plugin",
  "ref": "v1.0.0",
  "version": "^1.0.0"
}
```

`ref` is optional (git ref / tag / branch); `version` is an optional semver
range checked against the cloned plugin's manifest. As of v2.6.0 plugin
installs are fail-fast with atomic rollback — any clone, rename, semver, or
conflict error throws a typed `PluginInstallError` and leaves the
filesystem and registry untouched. Deps without a `version:` constraint
remain legacy-compatible.

Install or update from the CLI:

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin install <url> [--ref <ref>]
deno run -A jsr:@ursamu/ursamu/cli plugin update
deno run -A jsr:@ursamu/ursamu/cli plugin list
```

## Local script overrides

The engine has no bundled `system/scripts/` — all native commands are
`addCmd` registrations in `src/commands/`. Child games may still place
sandbox scripts under their own `system/scripts/<name>.ts` to:

- Override a plugin-supplied or registered script (local file wins).
- Add new in-sandbox commands without writing a plugin.

Scripts run in a Web Worker — no `Deno.*`, no `fetch`, no `import` other
than ESM-style `export default async (u) => { ... }`. See `CLAUDE.md`
("Softcode / system scripts") for the sandbox contract.

## Existing child games

The following projects use UrsaMU as their engine and can be read as
working references. Treat the layout as the canonical pattern; treat
project-specific mechanics as their own.

- `legends` — the in-repo reference game (gitignored under `games/`)
- `salem-rentals`
- `urban-shadows`

## Updating the engine

```bash
deno run -A jsr:@ursamu/ursamu/cli update         # latest stable
deno run -A jsr:@ursamu/ursamu/cli update main    # specific branch
```

The updater rewrites the import map and re-runs `ensurePlugins`. Restart
the game after an update.
