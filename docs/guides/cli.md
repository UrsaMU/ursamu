---
layout: layout.vto
title: CLI Reference
description: Complete reference for the UrsaMU command-line interface — create projects, scaffold plugins, and manage the plugin registry.
---

# CLI Reference

The UrsaMU CLI requires no install — run it directly from JSR with `deno run`.

## Running the CLI

```bash
deno run -A jsr:@ursamu/ursamu/cli <command> [options]
```

Or install it locally for convenience (see [install-cli](#install-cli)).
---

## create

Scaffold a new game project or plugin.

### New game project

```bash
deno run -A jsr:@ursamu/ursamu/cli create <project-name>
```

Creates a new directory with a fully-configured UrsaMU game project:
- `src/main.ts` — entry point
- `src/plugins/` — plugin directory (auto-discovered)
- `system/scripts/` — local script overrides
- `config/config.json` — server configuration
- `deno.json` — Deno project file

### In-tree plugin (inside an existing project)

```bash
deno run -A jsr:@ursamu/ursamu/cli create plugin <name>
```

Run from your game project root. Generates `src/plugins/<name>/` with:
- `index.ts` — plugin definition (`IPlugin`)
- `commands.ts` — command registrations
- `README.md` — plugin documentation stub

### Standalone publishable plugin

```bash
deno run -A jsr:@ursamu/ursamu/cli create plugin <name> --standalone
```

Generates a self-contained plugin repo at `./<name>/` ready for publishing to JSR or GitHub.
---

## plugin

Manage the plugin registry (`src/plugins/plugins.manifest.json`).

### List installed plugins

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin list
```

### Install a plugin

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin install <github-url>
```

Adds the plugin to the manifest and downloads it into `src/plugins/`.

Pin to a specific tag or commit:

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin install <github-url> --ref v1.2.0
```

### Update a plugin

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin update <name>
```

Fetches the latest ref for the plugin and updates the manifest.

### Remove a plugin

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin remove <name>
```

Removes the plugin from the manifest and deletes its directory.

### Show plugin info

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin info <name>
```

Displays metadata, installed version, and available update.

### Search

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin search <query>
```

Search the public plugin registry for plugins matching `<query>`.

### Plugin install behavior (v2.6.0)

The plugin installer is **fail-fast with whole-manifest atomic rollback**.
If any plugin (or transitive `deps[]` entry) fails to clone, has an unsafe
name or URL, violates a `version` semver range, or conflicts with another
dep's range, the entire install run aborts. Disk and the plugin registry
are left exactly as they were before the run — your previously installed
plugins are not touched. See
[Admin Guide → Plugin Install Behavior](./admin-guide.md#plugin-install-behavior)
for the full list of error classes.
---

## update

Update the UrsaMU engine in an existing game project.

```bash
deno run -A jsr:@ursamu/ursamu/cli update
```

Preview changes without writing:

```bash
deno run -A jsr:@ursamu/ursamu/cli update --dry-run
```
---

## scripts

List the names and aliases of every script the engine and its plugins
register at startup. Useful for discovering what's already registered before
you write an override.

```bash
deno run -A jsr:@ursamu/ursamu/cli scripts list
```
---

## config

Print the current server configuration:

```bash
deno task config
```
---

## install-cli

Install the CLI as a local binary so you don't need the full `deno run` invocation:

```bash
deno task install-cli
```

After install:

```bash
ursamu create my-game
ursamu plugin list
```
