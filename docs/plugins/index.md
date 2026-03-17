---
layout: layout.vto
description: Learn how to create plugins to extend UrsaMU
nav:
  - text: Overview
    url: "#overview"
  - text: Plugin Structure
    url: "#plugin-structure"
  - text: Quick Scaffold
    url: "#quick-scaffold"
  - text: Plugin Interface
    url: "#plugin-interface"
  - text: Adding Commands
    url: "#adding-commands"
  - text: Adding REST Routes
    url: "#adding-rest-routes"
  - text: Custom Database
    url: "#custom-database"
  - text: Configuration
    url: "#configuration"
  - text: The Manifest File
    url: "#the-manifest-file"
  - text: Installing Community Plugins
    url: "#installing-community-plugins"
  - text: Real Examples
    url: "#real-examples"
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
| `u.bb.*` | Bulletin board SDK |
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
  "main": "index.ts"
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
| `src/plugins/bboards/` | Multi-resource REST API, per-user state (unread counts), admin-restricted mutations |
| `src/plugins/events/` | Sequential IDs, RSVP capacity enforcement, cancelled-event visibility rules, REST + in-game commands |
