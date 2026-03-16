---
layout: layout.vto
title: Scripting Guide
description: How to write and run scripts in UrsaMU's sandboxed scripting environment
---

# Scripting Guide

UrsaMU scripts are TypeScript/JavaScript files that run inside **Web Workers** — completely isolated from the host process. Every script receives a typed SDK object called `u` that provides everything a script needs to interact with the game world.

## How It Works

When a player runs a command (or `@trigger` fires an attribute), the Sandbox Service:

1. Spawns a Web Worker
2. Injects the **`u` SDK object** as a global
3. Runs the script (ESM module or legacy block)
4. Worker posts results/messages back to the server
5. Worker terminates

Scripts are fully isolated — they cannot crash the server, access the filesystem, or make network requests. All interaction happens through `u`.

---

## The `u` Object

Every script has access to a global `u` object. It contains both the current execution context and all SDK methods.

### Context Properties

```typescript
u.me        // IDBObj — the actor (player or object running the script)
u.here      // IDBObj — the room the actor is in; also has .broadcast()
u.target    // IDBObj | undefined — an optional target object
u.cmd       // { name, args, switches } — the command that triggered this
u.state     // Record<string, unknown> — reactive per-execution state
u.socketId  // string | undefined — socket ID of the triggering connection
```

#### `IDBObj` shape

```typescript
{
  id: string;
  name?: string;
  location?: string;
  flags: Set<string>;          // e.g. new Set(["player", "connected"])
  state: Record<string, unknown>;  // player/object data (desc, attrs, etc.)
  contents: IDBObj[];
}
```

#### `u.cmd` shape

```typescript
u.cmd.name       // "look", "score", "bbpost", etc.
u.cmd.original   // raw command string typed by the player
u.cmd.args       // string[] — [rawArgString, ...splitArgs]
u.cmd.switches   // string[] | undefined — ["edit"] from "@bbpost/edit"
```

---

## Messaging

```typescript
// Send to the triggering player only
u.send("You look around the room.");

// Send to a specific player by ID
u.send("You have new mail.", targetPlayerId);

// Send with options (e.g. quit)
u.send("Goodbye!", undefined, { quit: true });

// Broadcast to ALL connected players (use sparingly)
u.broadcast("The server will reboot in 5 minutes.");

// Broadcast to all players in the current room
u.here.broadcast("Alice waves cheerfully.");

// Broadcast to all in target's room
u.target?.broadcast("Someone enters the room.");
```

---

## Database (`u.db`)

```typescript
// Search by query object (returns SDK IDBObj array)
const players = await u.db.search({ flags: /player/i });
const here    = await u.db.search({ id: u.me.location });
const byName  = await u.db.search({ "data.name": /alice/i });

// Create a new object
const coin = await u.db.create({
  flags: new Set(["thing"]),
  location: u.me.id,        // put it in actor's inventory
  state: { name: "Gold Coin", description: "A shiny coin." }
});

// Modify an object (always spread state to avoid clobbering)
await u.db.modify(u.me.id, "$set", {
  data: { ...u.me.state, score: (u.me.state.score as number || 0) + 10 }
});

// Destroy an object
await u.db.destroy(coin.id);
```

> **Important:** always spread existing state when modifying:
> `{ data: { ...u.me.state, myField: value } }` — omitting the spread
> will wipe all other fields.

---

## Finding Objects (`u.util.target`)

```typescript
// Find by name, ID, alias, "me", "here", etc.
const target = await u.util.target(u.me, u.cmd.args[0]);
if (!target) {
  u.send("I can't find that.");
  return;
}
```

---

## Flags & Permissions

```typescript
// Check flags
u.me.flags.has("wizard")    // true/false
u.me.flags.has("connected")

// Check edit permission (owner, admin, wizard)
if (!u.canEdit(u.me, target)) {
  u.send("Permission denied.");
  return;
}

// Set or remove flags
await u.setFlags(target.id, "dark");       // add flag
await u.setFlags(target.id, "!dark");      // remove flag
await u.setFlags(target.id, "wizard");     // grant wizard
```

---

## Locks

```typescript
// Evaluate a stored lock expression
const canPass = await u.checkLock(target, "player+");
```

---

## Movement

```typescript
// Move any object to a destination
u.teleport(objectId, destinationRoomId);
```

---

## Executing Commands

```typescript
// Run a command as the actor (fires the full command pipeline)
u.execute("look");
u.execute("say Hello, world!");

// Force a command (bypasses some permission checks — use carefully)
u.force("@set me=dark");
```

---

## Text (`u.text`)

Server-side named text blobs — used for MOTD, help files, etc.

```typescript
// Read a stored text entry
const motd = await u.text.read("motd");

// Write/update a text entry (admin scripts)
await u.text.set("motd", "Welcome to the game! Events tonight at 8pm.");
```

---

## Bulletin Boards (`u.bb`)

```typescript
// List all boards (includes unread counts for current player)
const boards = await u.bb.listBoards();

// List posts on a board
const posts = await u.bb.listPosts("announcements");

// Read a specific post
const post = await u.bb.readPost("announcements", 1);
if (post) u.send(`${post.subject}\n${post.body}`);

// Post to a board
await u.bb.post("announcements", "Server Update", "Maintenance tonight at midnight.");

// Mark a board as read
await u.bb.markRead("announcements");

// Get unread count totals
const newCount = await u.bb.totalNewCount();
```

---

## Mail (`u.mail`)

```typescript
// Send a message
await u.mail.send({
  id: crypto.randomUUID(),
  from: `#${u.me.id}`,
  to: [`#${recipientId}`],
  subject: "Hello",
  message: "Nice to meet you!",
  read: false,
  date: Date.now()
});

// Read mail (query by recipient ID)
const inbox = await u.mail.read({ to: { $in: [`#${u.me.id}`] } });

// Delete a message
await u.mail.delete(messageId);
```

---

## Channels (`u.chan`)

```typescript
// Join a channel
await u.chan.join("public", "pub");

// Leave by alias
await u.chan.leave("pub");

// List all channels
const channels = await u.chan.list();

// Admin: create a channel
await u.chan.create("events", { header: "[EVENTS]", hidden: false });

// Admin: destroy a channel
await u.chan.destroy("events");

// Admin: change channel properties
await u.chan.set("public", { header: "[PUB]", lock: "player+", masking: false });
```

---

## Attribute Triggers (`u.trigger`)

Fire a stored `&ATTR` on any object as a script:

```typescript
// Fire &OPEN on the target object, passing args
await u.trigger(target.id, "OPEN", ["force"]);

// Fire &ACONNECT on the player
await u.trigger(u.me.id, "ACONNECT");
```

---

## Authentication (`u.auth`)

Primarily used in `connect.ts` and registration scripts:

```typescript
// Verify login credentials
const ok = await u.auth.verify(name, password);

// Complete login (sets connected flag, joins socket rooms)
await u.auth.login(playerId);

// Hash a password for storage
const hashed = await u.auth.hash("mysecretpassword");

// Change a player's password
await u.auth.setPassword(playerId, "newpassword");
```

---

## System (`u.sys`)

Admin/wizard-only controls:

```typescript
// Set a config key at runtime
await u.sys.setConfig("game.masterRoom", "42");

// Disconnect a socket by socket ID
await u.sys.disconnect(socketId);

// Get server uptime in milliseconds
const ms = await u.sys.uptime();
const minutes = Math.floor(ms / 60000);

// Reboot or shut down
await u.sys.reboot();    // exits with code 75 (restart signal)
await u.sys.shutdown();  // exits with code 0
```

---

## Events (`u.events`)

Pub/sub events across the server:

```typescript
// Emit an event
await u.events.emit("player.levelup", { id: u.me.id, newLevel: 5 });

// Subscribe a handler attribute (the handler receives the event data)
const subId = await u.events.on("player.levelup", "LEVELUP_HANDLER");
```

---

## Formatting Utilities (`u.util`)

```typescript
// Display name (uses moniker if set, falls back to name)
const name = u.util.displayName(u.me, u.me);

// Text alignment
u.util.ljust("Left",    20)         // "Left                "
u.util.rjust("Right",   20)         // "               Right"
u.util.center("Center", 20, "-")    // "-------Center-------"

// printf-style sprintf
u.util.sprintf("%-10s %5d", "Score", 1200)

// Column template (multi-row data)
u.util.template(
  "[NNN] [TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT]",
  { N: "42", T: "Some long title here" }
)

// Strip MUSH color codes and ANSI escapes (for storage/validation)
u.util.stripSubs("%chHello %cgWorld%cn")  // → "Hello World"
```

---

## Structured UI (`u.ui`)

For web client panels (JSON output, not text):

```typescript
// Layout — posts a structured result to the web client
u.ui.layout({
  components: [
    { type: "header", title: "Character Sheet" },
    { type: "table", content: [["Name", u.util.displayName(u.me, u.me)]] }
  ]
});

// Render a template string
const html = u.ui.render("<b>{{name}}</b>", { name: "Alice" });
```

---

## Writing a Script

Scripts live in `system/scripts/`. The file name becomes the command name (minus any `@` prefix).

### ESM Style (recommended)

```typescript
// system/scripts/greet.ts
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default async (u: IUrsamuSDK) => {
  const targetName = (u.cmd.args[0] || "").trim();
  if (!targetName) {
    u.send("Usage: greet <player>");
    return;
  }

  const target = await u.util.target(u.me, targetName);
  if (!target) {
    u.send(`I can't find '${targetName}'.`);
    return;
  }

  const myName = u.util.displayName(u.me, u.me);
  u.send(`You wave to ${u.util.displayName(target, u.me)}.`);
  u.send(`${myName} waves to you.`, target.id);
  u.here.broadcast(`${myName} waves to ${u.util.displayName(target, u.me)}.`);
};
```

Players run it as `greet <name>` or `@greet <name>`.

### Legacy Block Style

Files without `export` run as a plain async block. The `u` global is injected directly:

```typescript
// system/scripts/gold.ts
const gold = (u.me.state.gold as number) || 0;
u.send(`You have ${gold} gold coins.`);
```

### Aliases

Export a const `aliases` array to register additional trigger names:

```typescript
export const aliases = ["greet", "wave"];
```

### Switches

Commands like `@bbpost/edit` or `@motd/set` pass the portion after `/` as `u.cmd.switches`:

```typescript
// u.cmd.switches = ["edit"] when player types @mycommand/edit
const switches = u.cmd.switches || [];
if (switches.includes("edit")) {
  // handle edit mode
}
```

---

## Security Model

| Capability | Available? |
|---|---|
| File system access | No |
| Network requests (`fetch`) | No |
| `Deno.*` API | No |
| Database (via `u.db`) | Yes |
| Messaging (via `u.send`, `u.broadcast`) | Yes |
| Channel ops (via `u.chan`) | Yes |
| Mail (via `u.mail`) | Yes |
| Bulletin boards (via `u.bb`) | Yes |
| System commands (via `u.sys`) | Wizard/admin only — enforced by scripts |
| ESM imports within same worker | Yes |
| JSR sub-path imports | Limited (import maps don't resolve in workers) |

Scripts run inside `Worker` with `/// <reference no-default-lib="true" />`, which blocks `Deno`, `fetch`, `XMLHttpRequest`, and the filesystem.

---

## MUSH Color Codes

UrsaMU processes traditional MUSH substitution codes in all outgoing text:

| Code | Effect |
|---|---|
| `%ch` | Bold / bright |
| `%cn` | Reset to normal |
| `%cr` | Red |
| `%cg` | Green |
| `%cb` | Blue |
| `%cy` | Yellow |
| `%cw` | White |
| `%cc` | Cyan |
| `%cm` | Magenta |
| `%n` | Actor's name |
| `%r` / `%R` | Newline |
| `%t` | Tab |
| `%b` | Space |

```typescript
u.send("%ch%cyWelcome to Arenthia!%cn");
u.send(`%ch%cr${u.util.ljust("ALERT", 10)}%cn Server restarting in 5 minutes.`);
```

Use `u.util.stripSubs(text)` to remove all codes before storing or comparing strings.
