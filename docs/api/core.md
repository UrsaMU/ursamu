---
layout: layout.vto
title: Core API Reference
description: ICmd, IUrsamuSDK, IPlugin, IDBObj — the complete type reference for UrsaMU plugin and script authors.
nav:
  - text: Imports
    url: "#imports"
  - text: IDBObj
    url: "#idbobj"
  - text: ICmd
    url: "#icmd"
  - text: IUrsamuSDK
    url: "#iursamusdk"
  - text: u.me / u.here
    url: "#ume--uhere"
  - text: u.db
    url: "#udb"
  - text: u.util
    url: "#uutil"
  - text: u.cmd
    url: "#ucmd"
  - text: u.auth
    url: "#uauth"
  - text: u.sys
    url: "#usys"
  - text: u.chan
    url: "#uchan"
  - text: u.bb
    url: "#ubb"
  - text: u.events
    url: "#uevents"
  - text: Top-level methods
    url: "#top-level-methods"
  - text: IPlugin
    url: "#iplugin"
  - text: Exported functions
    url: "#exported-functions"
---

# Core API Reference

This page documents the types and functions available to plugin and script authors.
All of these are exported from `jsr:@ursamu/ursamu`.

---

## Imports

```typescript
// Functions and classes
import { addCmd, registerPluginRoute, mu, createObj, DBO, dbojs } from "jsr:@ursamu/ursamu";

// Types (import type — zero runtime cost)
import type { ICmd, IPlugin, IDBObj, IUrsamuSDK } from "jsr:@ursamu/ursamu";
```

---

## IDBObj

Every object in the game database — players, rooms, exits, things — is an
`IDBObj`.

```typescript
interface IDBObj {
  id: string;                    // Numeric DB ID, e.g. "1", "42"
  name?: string;                 // Display name (top-level shortcut to state.name)
  flags: Set<string>;            // Flag set, e.g. Set { "player", "connected" }
  location?: string;             // ID of containing room or object
  state: Record<string, unknown>; // All stored data — desc, stats, attrs, etc.
  contents: IDBObj[];            // Objects contained by this object
}
```

| Field | Description |
|-------|-------------|
| `id` | Numeric string, e.g. `"1"`. Use this when calling DB methods or `u.teleport()`. |
| `flags` | Use `flags.has("wizard")`, not array methods. |
| `state` | Arbitrary key-value store. Cast values on read: `obj.state.gold as number`. |
| `contents` | Populated at query time — may be empty even if the object has contents depending on context. |

---

## ICmd

Passed to `addCmd()` to register a command.

```typescript
interface ICmd {
  name:     string;
  pattern:  string | RegExp;
  lock?:    string;
  exec:     (u: IUrsamuSDK) => void | Promise<void>;
  help?:    string;
  hidden?:  boolean;
  category?: string;
}
```

| Field | Description |
|-------|-------------|
| `name` | Human-readable name; appears in `help` listings unless `hidden` is true. |
| `pattern` | RegExp (or string converted to RegExp) matched against raw player input. Capture groups map to `u.cmd.args[0]`, `u.cmd.args[1]`, … |
| `lock` | Lock expression evaluated before `exec`. If the check fails the command silently does nothing. See the [Lock Expressions guide](../guides/lock-expressions.md). |
| `exec` | Async-safe — you can `await` inside freely. |
| `help` | Shown when a player runs `help <name>`. |
| `hidden` | Hides the command from `help` and `@commands` listings. |
| `category` | Groups related commands together in listings. |

### Example

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

addCmd({
  name: "+greet",
  pattern: /^\+greet\s+(.+)/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    u.send(`Hello, ${u.cmd.args[0]}!`);
  },
  help: "+greet <name>\nSays hello.",
});
```

---

## IUrsamuSDK

The `u` object injected into every command's `exec()` function and into
sandbox scripts. It provides everything the command needs — actor info, DB
access, messaging, and utility helpers.

```typescript
interface IUrsamuSDK {
  state:    Record<string, unknown>;   // Shared state bag for the command run
  socketId?: string;                   // WebSocket ID of the connected player
  me:       IDBObj;                    // The actor who triggered the command
  here:     IDBObj & { broadcast(msg: string): void };  // Actor's current room
  target?:  IDBObj & { broadcast(msg: string): void };  // Optional pre-resolved target
  cmd:      { name: string; args: string[]; switches?: string[]; original?: string };
  // ... namespaces below
}
```

---

## u.me / u.here

```typescript
u.me.id          // "42"
u.me.name        // "Alice"
u.me.location    // room ID
u.me.flags       // Set<string>
u.me.state       // all stored player data
u.me.contents    // inventory

u.here.id        // room ID
u.here.name      // room name
u.here.state     // room data (desc, exits, etc.)
u.here.contents  // everyone and everything in the room
u.here.broadcast("Message to everyone in the room.");
```

Check flags:

```typescript
u.me.flags.has("superuser")   // first player ever created
u.me.flags.has("admin")       // or "wizard" — equivalent
u.me.flags.has("builder")
u.me.flags.has("player")
u.me.flags.has("connected")   // currently online
```

---

## u.db

Database operations. All methods are async.

### `u.db.search(query)`

```typescript
const results: IDBObj[] = await u.db.search(query);
```

`query` can be:
- A string — searched against name, ID, and flags
- An object — field filter, e.g. `{ flags: ["room"] }`

```typescript
// Find all rooms
const rooms = await u.db.search({ flags: ["room"] });

// Find by name fragment
const matches = await u.db.search("Town Square");
```

### `u.db.create(template)`

```typescript
const obj: IDBObj = await u.db.create({
  name: "Magic Sword",
  flags: new Set(["thing"]),
  location: u.me.id,
  state: { desc: "A gleaming sword.", damage: 5 },
  contents: [],
});
```

### `u.db.modify(id, field, value)`

Updates a single field on an object.

```typescript
// Update state (always spread to preserve existing keys)
await u.db.modify(u.me.id, "state", { ...u.me.state, gold: 100 });

// Update name
await u.db.modify(obj.id, "name", "New Name");

// Update location
await u.db.modify(obj.id, "location", destinationId);
```

### `u.db.destroy(id)`

```typescript
await u.db.destroy(obj.id);
```

---

## u.util

Utility helpers.

### `u.util.target(actor, query, global?)`

Resolves a name or `#id` reference to an `IDBObj`. Searches the actor's
inventory then the current room. Pass `global: true` to search the whole DB.

```typescript
const obj = await u.util.target(u.me, u.cmd.args[0]);
if (!obj) return u.send("I don't see that here.");
```

### `u.util.displayName(obj, actor)`

Returns the display name of `obj` as seen by `actor`, applying moniker
substitutions if set.

```typescript
u.send(`You see ${u.util.displayName(target, u.me)}.`);
```

### `u.util.stripSubs(str)`

Strips MUSH color codes (`%cX`, `%n`, `%r`, `%t`, `%b`) and raw ANSI escapes.
Useful for measuring the true display length of a string.

```typescript
const plain = u.util.stripSubs("%chBold text%cn");
// → "Bold text"
```

### `u.util.center(str, length, filler?)`

Centers `str` within `length` characters, optionally padding with `filler`.

```typescript
u.send(u.util.center("TITLE", 78, "-"));
// → "--------------------------------TITLE---------------------------------"
```

### `u.util.ljust(str, length, filler?)` / `u.util.rjust(str, length, filler?)`

Left-pads or right-pads a string.

```typescript
u.send(u.util.ljust("Name", 20) + u.util.rjust("100", 10));
```

### `u.util.sprintf(format, ...args)`

Printf-style formatting.

```typescript
u.send(u.util.sprintf("%-20s %5d gp", player.name, gold));
```

---

## u.cmd

Populated by the command parser before `exec` is called.

```typescript
u.cmd.name       // "look"
u.cmd.args       // string[] — capture groups from the pattern RegExp
u.cmd.switches   // string[] — e.g. ["quiet"] from "@set/quiet ..."
u.cmd.original   // The raw input string the player typed
```

---

## u.auth

Authentication helpers for scripts that need to verify or change passwords.

```typescript
// Verify a password
const ok: boolean = await u.auth.verify(u.me.name!, "mypassword");

// Hash a password (bcrypt)
const hashed: string = await u.auth.hash("newpassword");

// Change a player's password (use carefully — no confirmation prompt)
await u.auth.setPassword(u.me.id, "newpassword");

// Log in a player (rarely needed in scripts)
await u.auth.login(u.me.id);
```

---

## u.sys

Server administration methods. Most are locked behind the `wizard` or
`superuser` flag in system scripts.

```typescript
// Set a config value (only keys whitelisted in the engine are accepted)
await u.sys.setConfig("server.name", "My Game");

// Disconnect a player by socket ID
await u.sys.disconnect(socketId);

// Server uptime in milliseconds
const ms: number = await u.sys.uptime();

// Reboot or shut down (DANGEROUS — confirms nothing)
await u.sys.reboot();
await u.sys.shutdown();
```

---

## u.chan

Channel management. Players can join/leave channels and admins can create and
configure them.

```typescript
// Join a channel (alias is the local shorthand, e.g. "pub")
await u.chan.join("Public", "pub");

// Leave by alias
await u.chan.leave("pub");

// List all channels the actor is a member of
const channels = await u.chan.list();

// Admin — create a channel
await u.chan.create("Staff", { header: "%ch[STAFF]%cn", hidden: true });

// Admin — destroy a channel
await u.chan.destroy("Staff");

// Admin — update channel settings
await u.chan.set("Public", { header: "%ch[PUB]%cn", masking: false });
```

---

## u.bb

Bulletin board access.

```typescript
// List all boards
const boards = await u.bb.listBoards();
// → [{ id, name, description, order, postCount, newCount }, ...]

// List posts on a board
const posts = await u.bb.listPosts(boardId);
// → [{ id, num, subject, authorName, date, edited? }, ...]

// Read a post (by board + post number)
const post = await u.bb.readPost(boardId, postNum);
// → { id, subject, body, authorName, date, edited? } | null

// Post a message
await u.bb.post(boardId, "Subject line", "Body text.");

// Edit a post you authored
await u.bb.editPost(boardId, postNum, "New body text.");

// Delete a post (owner or admin)
await u.bb.deletePost(boardId, postNum);

// Count unread posts
const total: number = await u.bb.totalNewCount();
```

---

## u.events

Emit custom events and register handlers by attribute name.

```typescript
// Emit an event (other scripts can listen)
await u.events.emit("game:levelup", { playerId: u.me.id, level: 5 });

// Register a listener (stores a script key to call when the event fires)
const handlerId = await u.events.on("game:levelup", "scripts/levelup-handler");
```

---

## Top-level methods

These are direct properties on `u`, not namespaced.

### `u.send(message, target?, options?)`

Sends `message` to the actor, or to `target` (DB ID) if provided.

```typescript
u.send("You say, \"Hello!\"");
u.send("Whispered message.", otherPlayerId);
```

### `u.broadcast(message, options?)`

Sends `message` to everyone in the actor's current room.

```typescript
u.broadcast(`${u.me.name} waves.`);
```

### `u.setFlags(target, flags)`

Sets or clears flags on a target. Prefix with `!` to remove.

```typescript
await u.setFlags(u.me.id, "builder");      // add "builder"
await u.setFlags(u.me.id, "!builder");     // remove "builder"
await u.setFlags(obj.id, "dark");
```

### `u.checkLock(target, lock)`

Evaluates a lock expression against a target. Returns `true` if the lock passes.

```typescript
const canEnter = await u.checkLock(u.me, "builder|wizard");
```

See the [Lock Expressions guide](../guides/lock-expressions.md) for syntax.

### `u.teleport(target, destination)`

Moves `target` (DB ID) to `destination` (DB ID).

```typescript
await u.teleport(u.me.id, "1");  // send actor to room #1
```

### `u.force(command)`

Executes `command` as if the actor typed it.

```typescript
u.force("look");
```

### `u.execute(command)`

Executes `command` as the server (no actor context).

```typescript
u.execute("@pemit #3=Server message.");
```

### `u.trigger(target, attr, args?)`

Triggers an attribute script on `target`.

```typescript
await u.trigger(room.id, "onEnter", [u.me.id]);
```

### `u.canEdit(actor, target)`

Returns `true` if `actor` has permission to edit `target`.

```typescript
const ok = await u.canEdit(u.me, target);
if (!ok) return u.send("Permission denied.");
```

---

## IPlugin

The interface your plugin's exported object must satisfy.

```typescript
interface IPlugin {
  name:         string;
  version:      string;
  description?: string;
  init?:        () => boolean | Promise<boolean>;
  remove?:      () => void   | Promise<void>;
}
```

```typescript
import type { IPlugin } from "jsr:@ursamu/ursamu";
import "./commands.ts";

export const plugin: IPlugin = {
  name:        "my-plugin",
  version:     "1.0.0",
  description: "Does cool things.",
  init: async () => {
    // Startup logic — seed data, connect to external services, etc.
    return true;   // return false to abort loading
  },
};
```

---

## Exported functions

These are the top-level exports you import from `jsr:@ursamu/ursamu`.

### `addCmd(...cmds: ICmd[])`

Registers one or more commands. Safe to call at module level.

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";

addCmd(
  { name: "cmd1", pattern: /^cmd1$/i, exec: (u) => u.send("one") },
  { name: "cmd2", pattern: /^cmd2$/i, exec: (u) => u.send("two") },
);
```

### `registerPluginRoute(prefix, handler)`

Registers a custom HTTP route handled by your plugin.

```typescript
import { registerPluginRoute } from "jsr:@ursamu/ursamu";

registerPluginRoute("/api/v1/my-plugin", async (req, userId) => {
  return Response.json({ ok: true, userId });
});
```

`handler` signature: `(req: Request, userId: string | null) => Promise<Response>`

### `mu(config?)`

Starts the UrsaMU engine. Called once in your game's `src/main.ts`. Returns
a Deno `Deno.HttpServer` instance.

```typescript
import { mu } from "jsr:@ursamu/ursamu";
await mu();
```

### `createObj(template)`

Creates a new object directly in the DB. Useful in startup scripts or
migrations that run outside a command handler (where `u.db.create()` isn't
available).

```typescript
import { createObj } from "jsr:@ursamu/ursamu";

const room = await createObj({
  name: "The Void",
  flags: new Set(["room"]),
  state: { desc: "An empty room." },
  contents: [],
});
```

### `DBO`

The raw Deno KV database wrapper. Use `dbojs` for most game-data access — `DBO`
is for low-level or plugin-specific storage.

```typescript
import { DBO } from "jsr:@ursamu/ursamu";

const db = new DBO<{ score: number }>("server.highscores");
await db.create({ score: 100 });
const all = await db.all();
```

### `dbojs`

The game-object database accessor. Lets you query `IDBObj` records directly.

```typescript
import { dbojs } from "jsr:@ursamu/ursamu";

const players = await dbojs.queryAll((o) => o.flags.has("player"));
const room    = await dbojs.queryOne((o) => o.id === "1");
```
