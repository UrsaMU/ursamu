---
layout: layout.vto
description: The IPlugin interface, lifecycle, and auto-discovery explained
---

# Plugin Basics

## Auto-Discovery

UrsaMU automatically loads every folder inside `src/plugins/` that contains an
`index.ts` exporting a default `IPlugin` object. No registration, no config
entry required — just drop the folder in and restart the server.

```
src/plugins/
├── events/         ← auto-loaded
├── jobs/           ← auto-loaded
└── my-plugin/      ← auto-loaded the next time you start
```
---

## The IPlugin Interface

```typescript
// src/@types/IPlugin.ts
export interface IPlugin {
  name: string;          // unique slug — used in logs and config namespacing
  version: string;       // semver, e.g. "1.0.0"
  description?: string;
  config?: IConfig;      // optional default config values (deep-merged at startup)

  init?: () => boolean | Promise<boolean>;  // called once at startup
  remove?: () => void   | Promise<void>;    // called when the plugin is unloaded
}
```

That is the complete interface. There is no `author` field, no `dependencies`
array, no `App` parameter, and no `onInit`/`onLoad`/`onUnload` lifecycle
methods. The interface is intentionally minimal.
---

## Lifecycle

| Stage | Trigger | What happens |
|-------|---------|-------------|
| **Module import** | Server start — `index.ts` is imported | `addCmd()` calls in `commands.ts` run immediately at import time |
| **`init()`** | Called once after all modules are imported | Call `registerPluginRoute()`, log startup info, return `true` on success or `false` to signal failure |
| **`remove()`** | Plugin unloaded | Clean up any timers, intervals, or external connections |

> `addCmd` and `new DBO<T>()` are called at **module-load time**, not inside
> `init()`. Import `"./commands.ts"` from `index.ts` and the registrations
> happen automatically.

> **Named handler refs.** Any `gameHooks.on(event, handler)` registered in
> `init()` must be paired with `gameHooks.off(event, handler)` in `remove()`
> using the **same named function reference**. Inline arrow functions cannot
> be unsubscribed. See [hooks.md](./hooks.md#full-example).

> **DBO namespacing.** Collection names must be prefixed with your plugin
> name to avoid colliding with the core engine or other plugins:
> `new DBO<T>("my-plugin.records")`. See [database.md](./database.md).

> **Stdlib primitives.** Plugins written in TypeScript can import
> `Noise`, `Rng`, vector/spatial helpers, interpolation, and physics
> primitives directly from `jsr:@ursamu/ursamu` (v2.5.1+). No need to vendor
> `simplex-noise` or `alea`.
---

## A Minimal Plugin

```typescript
// src/plugins/hello/index.ts
import type { IPlugin } from "../../@types/IPlugin.ts";

const helloPlugin: IPlugin = {
  name: "hello",
  version: "1.0.0",
  description: "A minimal working plugin",

  init: async () => {
    console.log("[hello] initialized");
    return true;
  },

  remove: async () => {
    console.log("[hello] removed");
  },
};

export default helloPlugin;
```

That is a complete, loadable plugin. Start the server and you will see
`[hello] initialized` in the log.
---

## Standard File Layout

Full-featured plugins split their code across four files, plus a manifest:

```
src/plugins/my-plugin/
├── index.ts             — IPlugin object; wires everything together
├── commands.ts          — addCmd() registrations
├── router.ts            — HTTP route handler
├── db.ts                — DBO<T> database collections + types
└── ursamu.plugin.json   — manifest (required for ursamu plugin install)
```

### index.ts wires the other three

```typescript
import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { myRouteHandler } from "./router.ts";
import "./commands.ts";  // importing triggers addCmd() registrations

const myPlugin: IPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  description: "Does something useful",

  init: async () => {
    registerPluginRoute("/api/v1/my-plugin", myRouteHandler);
    console.log("[my-plugin] initialized");
    return true;
  },

  remove: async () => {
    console.log("[my-plugin] removed");
  },
};

export default myPlugin;
```

### ursamu.plugin.json

Every plugin that may be shared or installed by others should include this
manifest at the plugin root:

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

Each `deps[]` entry may include an optional `version` semver range
(`"^1.2.0"`, `">=1.0.0 <2.0.0"`). When present, the installer reads the
dep's own manifest `version` and aborts the whole install if it does not
satisfy the range. Omit `version` to install the dep without a check
(backwards compatible). See the
[Plugin Manager](./index.md#installing-community-plugins) and the
[`deps[]` reference](./index.md#deps-entries) for the full install,
update, remove, and atomic-rollback semantics.
