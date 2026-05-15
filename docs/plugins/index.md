---
layout: layout.vto
description: Learn how to create plugins to extend UrsaMU
---

# UrsaMU Plugin Development

## Overview

Plugins are the primary way to extend UrsaMU. A plugin can provide any
combination of:

- **In-game commands** — registered with `addCmd`, available to all connected players
- **REST API routes** — registered with `registerPluginRoute`, accessible to custom frontends
- **A private database** — a `DBO<T>` collection namespaced to the plugin
- **Config defaults** — merged into the global config on startup

Plugins are **auto-discovered**. Drop a folder into `src/plugins/` with an
`index.ts` that exports a default `IPlugin` object and the engine loads it on
next start — no registration required.
---

## Plugin Structure

A full plugin lives in its own subdirectory:

```
src/plugins/my-plugin/
├── index.ts             — entry point (IPlugin, registerPluginRoute)
├── commands.ts          — in-game commands (addCmd)
├── router.ts            — HTTP route handler
├── db.ts                — custom DBO database
└── ursamu.plugin.json   — manifest (required for ursamu plugin install)
```

Only `index.ts` is required. The other files are imported from it.
---

## Quick Scaffold

The fastest way to start is the built-in CLI scaffolder. Run from your game
project root:

```bash
ursamu create plugin my-plugin
```

This generates all four files pre-named and pre-wired. Restart the server and
the plugin loads automatically. You can also copy `src/plugins/example/`
directly — it is a fully working reference implementation.
---

## Plugin Interface

Every plugin implements `IPlugin`:

```typescript
import type { IPlugin } from "../../@types/IPlugin.ts";

const myPlugin: IPlugin = {
  name: "my-plugin",        // unique slug — used for logging and config namespacing
  version: "1.0.0",         // semver
  description: "Does a thing",

  // Optional: default config values merged into global config at startup
  config: {
    plugins: {
      "my-plugin": {
        enabled: true,
        maxItems: 50,
      },
    },
  },

  // Called once at startup — register routes here, return false to abort load
  init: async () => {
    console.log("[my-plugin] initialized");
    return true;
  },

  // Called when the plugin is unloaded
  remove: async () => {
    console.log("[my-plugin] removed");
  },
};

export default myPlugin;
```
---

## Adding Commands

Import `addCmd` and call it at module load time (in `commands.ts`, not inside
`init()`). The `exec` function receives a fully populated `IUrsamuSDK` (`u`).

```typescript
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

addCmd({
  name: "+greet",
  pattern: /^\+greet(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase(); // switch after /
    const arg = (u.cmd.args[1] || "").trim();        // rest of input

    if (sw === "all") {
      u.broadcast(`${u.me.name} greets everyone!`);
      return;
    }

    u.send(`Hello, ${arg || "world"}!`);
  },
});
```

Import `commands.ts` from `index.ts` to trigger registration at startup:

```typescript
// index.ts
import "./commands.ts";
```

### The IUrsamuSDK object

| Property | Description |
|----------|-------------|
| `u.me` | The acting player — `id`, `name`, `flags` (Set), `state`, `location` |
| `u.here` | The current room |
| `u.cmd.args` | Regex capture groups from `pattern` |
| `u.send(msg)` | Send a message to the current player |
| `u.broadcast(msg)` | Send a message to everyone in the room |
| `u.db.search(query)` | Query the main object database |
| `u.chan.*` | Channel SDK |
| `u.events.*` | Pub/sub EventsService SDK |
| `u.auth.*` | Auth SDK (hash, setPassword) |
| `u.sys.*` | System SDK (disconnect, setConfig) |
| `u.util.*` | Utility helpers (target, stripSubs, ljust, rjust, …) |
---

## Adding REST Routes

Register a route handler from `init()`:

```typescript
// index.ts
import { registerPluginRoute } from "../../app.ts";
import { myRouteHandler } from "./router.ts";

init: async () => {
  registerPluginRoute("/api/v1/my-plugin", myRouteHandler);
  return true;
},
```

The handler receives the raw `Request` and the authenticated `userId` (or
`null` if unauthenticated — JWT verification is handled by the engine before
your handler is called):

```typescript
// router.ts
const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function myRouteHandler(
  req: Request,
  userId: string | null
): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const { pathname } = new URL(req.url);

  if (pathname === "/api/v1/my-plugin" && req.method === "GET") {
    return json({ ok: true });
  }

  return json({ error: "Not Found" }, 404);
}
```

All CORS headers are added automatically by the engine.
---

## Custom Database

Create a typed `DBO<T>` collection in `db.ts`:

```typescript
import { DBO } from "../../services/Database/database.ts";

export interface IMyRecord {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export const myRecords = new DBO<IMyRecord>("server.my-plugin-records");
```

`DBO<T>` methods:

| Method | Description |
|--------|-------------|
| `create(record)` | Insert a new record, returns the created object |
| `queryOne(query)` | Find the first match, or `undefined` |
| `find(query)` | Find all matches |
| `update({}, record)` | Replace a record (matches by `id`) |
| `modify(query, "$set", data)` | Partial field update |
| `delete(query)` | Remove matching records |
| `all()` | Return every record in the collection |
---

## Configuration

Plugins declare defaults in the `config` property. Values are read via
`getConfig`:

```typescript
import { getConfig } from "../../services/Config/mod.ts";

const maxItems = getConfig<number>("plugins.my-plugin.maxItems") ?? 50;
```

Operators override values in `config/config.json` under the same key path.
---

## The Manifest File

Every plugin that will be shared or installed from GitHub **must** include an
`ursamu.plugin.json` at the plugin root. The install command reads this file to
display details and populate the local registry.

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "ursamu": ">=1.0.0",
  "author": "Your Name",
  "license": "MIT",
  "main": "index.ts",
  "deps": [
    { "name": "jobs", "url": "https://github.com/UrsaMU/jobs-plugin", "version": "^1.9.0" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Directory-safe slug — becomes the install folder name |
| `version` | yes | Semver string |
| `description` | yes | Short human-readable description |
| `ursamu` | yes | Semver range of compatible UrsaMU versions |
| `author` | no | Author name or contact |
| `license` | no | SPDX license identifier, e.g. `"MIT"` |
| `main` | no | Entry-point file, defaults to `"index.ts"` |
| `deps` | no | Array of transitive plugin dependencies — see below |

### `deps[]` entries

Each entry declares a plugin this one needs at runtime. The installer
resolves the full graph before writing anything.

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Plugin slug — install folder name |
| `url` | yes | Git URL the installer will clone |
| `ref` | no | Git ref (tag, branch, commit) |
| `version` | no | Semver range (e.g. `"^1.2.0"`, `">=1.0.0 <2.0.0"`) checked against the dep's own manifest `version` |

The `version` field is optional and opt-in. When omitted, the dep installs
as before with no version check. When present, the installer reads the
dep's `ursamu.plugin.json` after clone and aborts if its `version` does
not satisfy the range — or if two requesters ask for incompatible ranges.

### Atomic installs

`ensurePlugins` (and the bulk install path used on first startup) is
fail-fast across the entire manifest. If any plugin or transitive dep
fails for any of these reasons, the whole run aborts and rolls back:

- Clone failure or rename failure
- Unsafe plugin name (path traversal, reserved characters)
- Unsafe or unsupported clone URL
- Manifest version does not satisfy a requested `version:` range
- Two requesters declare incompatible `version:` ranges for the same dep
- Malformed semver in any range or manifest version

On abort, nothing from the failed run is left on disk or in
`.registry.json`. Plugins installed in previous successful runs are not
touched. The installer throws a `PluginInstallError` (or one of its
subclasses) describing which entry failed and why.

The `ursamu create plugin <name> --standalone` command generates this file
automatically when scaffolding a new publishable plugin project.
---

## Installing Community Plugins

The plugin manager handles install, update, remove, and inspect operations:

```bash
# Install from a GitHub URL
ursamu plugin install https://github.com/user/my-plugin

# Update to the latest commit
ursamu plugin update my-plugin

# List all installed plugins (with version + source)
ursamu plugin list

# Show manifest and registry details
ursamu plugin info my-plugin

# Remove a plugin
ursamu plugin remove my-plugin
```

The install flow:
1. Clones the repo with `git clone --depth 1`
2. Reads `ursamu.plugin.json` (warns but continues if absent)
3. **Displays the manifest and asks for confirmation** before writing anything
4. Copies the plugin into `src/plugins/`
5. Records the source URL in `src/plugins/.registry.json` so `update` works later

Use `--force` to skip the confirmation prompt in CI/automation:

```bash
ursamu plugin install --force https://github.com/user/my-plugin
```
---

## Real Examples

The bundled plugins demonstrate every capability:

| Plugin | What it shows |
|--------|---------------|
| `src/plugins/example/` | Minimal template — commands, REST, database, config |
| `src/plugins/jobs/` | Full CRUD REST API, staff permission checks, in-game commands with switches |
| `src/plugins/events/` | Sequential IDs, RSVP capacity enforcement, cancelled-event visibility rules, REST + in-game commands |
---

## Plugin Docs Index

| Page | Topic |
|------|-------|
| [basics.md](./basics.md) | `IPlugin` interface, lifecycle, auto-discovery, file layout |
| [first-plugin.md](./first-plugin.md) | Step-by-step walkthrough of a complete plugin |
| [commands.md](./commands.md) | `addCmd` reference, patterns, switches, lockfuncs |
| [database.md](./database.md) | `DBO<T>` collections, queries, namespacing rules |
| [configuration.md](./configuration.md) | Default config values, `getConfig`, env vars for secrets |
| [hooks.md](./hooks.md) | `gameHooks` event bus, scene/wiki/event/chargen hooks, `EventsService` |
| [dependencies.md](./dependencies.md) | Sharing code between plugins, `deps[]` manifest entries |
| [official-plugins.md](./official-plugins.md) | Plugin registry — channel, discord, jobs, events, bbs, wiki, mail, builder, chargen, help |
| [chargen.md](./chargen.md) | Bundled chargen plugin — commands, hooks, REST API |
| [events.md](./events.md) | Bundled events plugin — calendar, RSVPs, REST API |
