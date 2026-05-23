---
layout: layout.vto
title: Customization Guide
description: How to customize UrsaMU — MUSH colors, custom commands, plugins, REST routes, and external integrations.
---

# Customization Guide

This guide covers the real extension points for UrsaMU — the patterns you
actually use to add commands, store per-object data, build plugins, and connect
to outside services.
---

## Text Formatting

UrsaMU uses MUSH-style substitution codes for in-game text. They work in any
string you pass to `u.send()`, `u.broadcast()`, or stored in a help file.

### Color codes

| Code | Color / Effect |
|------|----------------|
| `%cr` | Red |
| `%cg` | Green |
| `%cy` | Yellow |
| `%cb` | Blue |
| `%cm` | Magenta |
| `%cw` | White |
| `%ch` | Bold / bright |
| `%cn` | Reset to normal |

**Example:**

```
u.send("%ch%crERROR:%cn You can't do that.");
// → bold red "ERROR:" followed by normal text
```

### Other substitutions

| Code | Expands to |
|------|-----------|
| `%n` | Actor's name |
| `%r` | Newline |
| `%t` | Tab |
| `%b` | Space |

> **Note:** In the old Customization guide this was listed as `%r = Red`. That
> was wrong — `%r` is a **newline**, not red. Red is `%cr`.
---

## Custom Commands

Register new in-game commands with `addCmd()`. Call it at module level — it
runs once when your file is imported at server startup.

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

addCmd({
  name: "+roll",
  pattern: /^\+roll(?:\s+(\d+)d(\d+))?/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const count = parseInt(u.cmd.args[0] || "1");
    const sides = parseInt(u.cmd.args[1] || "6");
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(Math.ceil(Math.random() * sides));
    }
    const total = results.reduce((a, b) => a + b, 0);
    u.send(`%ch+ROLL:%cn ${results.join(", ")} = %ch${total}%cn`);
  },
  help: "+roll [<count>d<sides>]\nRolls dice. Default: 1d6.",
});
```

### ICmd fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Display name for help listings |
| `pattern` | `string \| RegExp` | Yes | Matched against raw input; capture groups become `u.cmd.args` |
| `lock` | `string` | No | Lock expression evaluated before exec (default: none) |
| `exec` | `(u: IUrsamuSDK) => void \| Promise<void>` | Yes | Command handler |
| `help` | `string` | No | Help text shown by the `help` command |
| `hidden` | `boolean` | No | If `true`, omit from help listings |
| `category` | `string` | No | Groups commands under a category in help |

### Overriding built-in commands

Register a command with the same name — the last one registered wins.

```typescript
addCmd({
  name: "look",
  pattern: /^(?:look|l)(?:\s+(.+))?$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const arg = (u.cmd.args[0] || "").trim();
    if (arg) {
      const target = await u.util.target(u.me, arg);
      if (!target) return u.send("I don't see that here.");
      return u.send(target.state.desc as string || "You see nothing special.");
    }
    u.send(u.here.state.desc as string || "You see nothing special.");
  },
});
```

### Switches

Commands can accept `/switch` syntax — `@set/quiet object=flag`:

```typescript
addCmd({
  name: "@myset",
  pattern: /^@myset(?:\/([\w]+))?\s+(.*)/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase();
    const arg = u.cmd.args[1] || "";
    if (sw === "quiet") {
      // suppress output
    }
    u.send(`Set: ${arg}`);
  },
});
```
---

## Custom Attributes

All game objects have a `state` field (`Record<string, unknown>`) for storing
arbitrary data. Use `u.db.modify()` to write and `obj.state` to read.

### Storing a value

```typescript
// Set "gold" on the actor
await u.db.modify(u.me.id, "state", { ...u.me.state, gold: 100 });
```

### Reading a value

```typescript
const gold = u.me.state.gold as number || 0;
u.send(`%chGOLD:%cn You have ${gold} gold.`);
```

### Storing on another object

```typescript
const target = await u.util.target(u.me, u.cmd.args[0]);
if (!target) return u.send("Not found.");
await u.db.modify(target.id, "state", { ...target.state, desc: u.cmd.args[1] });
u.send("Description set.");
```

### Per-object stats example

```typescript
// +stats command
addCmd({
  name: "+stats",
  pattern: /^\+stats(?:\s+(.+))?/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const who = u.cmd.args[0]
      ? await u.util.target(u.me, u.cmd.args[0])
      : u.me;
    if (!who) return u.send("Not found.");
    const str = who.state.str as number || 10;
    const dex = who.state.dex as number || 10;
    const con = who.state.con as number || 10;
    u.send(
      `%ch${who.name}%cn — STR: %ch${str}%cn  DEX: %ch${dex}%cn  CON: %ch${con}%cn`
    );
  },
});
```
---

## Plugins

A plugin is a TypeScript module with an optional `init()` function. Plugins
are imported by your game's `src/main.ts` at startup.

### Plugin structure

```
src/plugins/my-plugin/
├── index.ts        ← IPlugin export (optional init hook)
└── commands.ts     ← addCmd() registrations
```

### `index.ts`

```typescript
import type { IPlugin } from "jsr:@ursamu/ursamu";
import "./commands.ts";   // importing triggers addCmd() registrations

export const plugin: IPlugin = {
  name:        "my-plugin",
  version:     "1.0.0",
  description: "Does cool things.",
  init: async () => {
    // One-time setup runs before the first player connects.
    // Fetch external data, seed DB records, register scheduled jobs, etc.
    console.log("[my-plugin] Ready.");
    return true;
  },
  remove: () => {
    // Optional cleanup if the plugin is ever unloaded.
  },
};
```

### Loading a plugin in `src/main.ts`

```typescript
import { plugin as myPlugin } from "./plugins/my-plugin/index.ts";

if (myPlugin.init) await myPlugin.init();
```

### IPlugin fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique plugin identifier |
| `version` | `string` | Yes | Semver version string |
| `description` | `string` | No | Human-readable description |
| `init` | `() => boolean \| Promise<boolean>` | No | Called once at startup; return `false` to abort |
| `remove` | `() => void \| Promise<void>` | No | Called when plugin is unloaded |
---

## REST Routes

Register custom HTTP endpoints with `registerPluginRoute()`. Routes are
mounted alongside the built-in `/api/v1/` routes.

```typescript
import { registerPluginRoute } from "jsr:@ursamu/ursamu";

registerPluginRoute("/api/v1/my-plugin", async (req, userId) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return Response.json({ message: "Hello from my plugin!", userId });
});
```

The handler receives:
- `req: Request` — the Deno `Request` object
- `userId: string | null` — the authenticated player's DB ID, or `null` if
  the request has no valid JWT

> **Auth tip:** Check `userId` and return `401` for endpoints that require
> authentication. The JWT is decoded for you — you don't need to re-verify it.

### Returning data from the DB

```typescript
registerPluginRoute("/api/v1/leaderboard", async (_req, _userId) => {
  const players = await dbojs.queryAll((o) => o.flags.has("player"));
  const ranked = players
    .map((p) => ({ name: p.data?.name, gold: p.data?.state?.gold ?? 0 }))
    .sort((a, b) => (b.gold as number) - (a.gold as number))
    .slice(0, 10);
  return Response.json(ranked);
});
```
---

## Format Handlers

The format-handler pipeline lets you replace the rendering of any "labelled
display slot" — the name shown at the top of `look`, the contents list, the
exit line, the WHO row, the @ps row, and more — without rewriting the command.

### The eight engine-known slots

| Slot | Used by |
|------|---------|
| `NAMEFORMAT` | Header line of `look` / `examine` |
| `DESCFORMAT` | Description block of `look` |
| `CONFORMAT` | The "Contents:" list in `look` |
| `EXITFORMAT` | The "Exits:" list in `look` |
| `WHOFORMAT` | Outer wrapper of the `who` command |
| `WHOROWFORMAT` | One row of `who` |
| `PSFORMAT` | Outer wrapper of `@ps` |
| `PSROWFORMAT` | One row of `@ps` |

Plugins can also register handlers for any uppercase slot name they invent
(e.g. `MAILFORMAT`, `BBROWFORMAT`) and resolve them from their own commands.

### Resolution priority

For any slot, the engine resolves in this order:

1. A stored `&SLOTNAME` softcode attribute on the target object (or, for
   global-list slots, on `#0`).
2. The most recently registered plugin format handler for that slot.
3. `null` (caller falls back to its default rendering).

This means builders can override a single object's display with `&NAMEFORMAT`
in-game **without** the plugin needing to know they exist.

### Register a TypeScript handler

```typescript
import { registerFormatHandler } from "jsr:@ursamu/ursamu";

registerFormatHandler("NAMEFORMAT", (target, viewer) => {
  const star = target.flags.has("admin") ? "%ch%cy*%cn " : "";
  return `${star}%ch${target.state.name}%cn`;
});
```

The handler receives the target, the viewer, and optional slot-specific
extras (for row-format slots, the row data). Return `null` to fall through
to the default.

### Register a MUSH-softcode template (v2.4.0)

If your handler is just a softcode string, use `registerFormatTemplate` —
the shortcut compiles the source once and wraps it in a TS handler for you.

```typescript
import { registerFormatTemplate } from "jsr:@ursamu/ursamu";

registerFormatTemplate(
  "EXITFORMAT",
  "[ansi(hy,<)] [name(%0)] [ansi(hy,>)]"
);
```

### Unregister

```typescript
import { unregisterFormatHandler } from "jsr:@ursamu/ursamu";
unregisterFormatHandler("NAMEFORMAT");
```

### Resolving from a script

Scripts use `u.util.resolveFormat[Or]` and `u.util.resolveGlobalFormat[Or]`
to render through the pipeline. See the
[SDK Cookbook](./sdk-cookbook.md#resolveformat--resolveformator).
---

## External Integrations

### Fetching data in a command

Deno has native `fetch()` — no extra packages needed.

```typescript
addCmd({
  name: "+weather",
  pattern: /^\+weather\s+(.+)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const city = encodeURIComponent(u.cmd.args[0]);
    try {
      const resp = await fetch(`https://wttr.in/${city}?format=3`);
      const text = await resp.text();
      u.send(`%chWEATHER:%cn ${text.trim()}`);
    } catch {
      u.send("%chWEATHER:%cn Could not retrieve weather.");
    }
  },
  help: "+weather <city>\nFetches current weather for a city.",
});
```

### Fetching in `init()`

If your plugin needs to pre-fetch data or connect to an external service, do
it in `init()` so it's ready before players arrive:

```typescript
let motdText = "Welcome!";

export const plugin: IPlugin = {
  name: "motd-fetcher",
  version: "1.0.0",
  init: async () => {
    try {
      const resp = await fetch("https://your-api.example.com/motd");
      motdText = (await resp.json()).message;
    } catch {
      // keep default
    }
    return true;
  },
};

// In a command handler:
addCmd({
  name: "+motd",
  pattern: /^\+motd$/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => { u.send(motdText); },
});
```

### Discord bridge

For a Discord bridge plugin, use the built-in `u.chan` SDK methods alongside
a Discord WebSocket client in your plugin's `init()`. See the Discord plugin
in `src/plugins/discord/` as a reference implementation.
