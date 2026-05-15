---
layout: layout.vto
title: SDK Cookbook
description: Complete reference for every u.* namespace with real working examples
---

# SDK Cookbook

Every method available on the `u` object, organized by namespace, with working examples pulled from real system scripts.
---

## Context Objects

These are injected automatically — you don't call them, you read them.

### `u.me` — The Actor

The player or object that triggered the script.

```typescript
u.me.id           // "42"
u.me.name         // "Alice" (raw DB name)
u.me.location     // "1" (room ID)
u.me.flags        // Set<string> — e.g. Set { "player", "connected", "wizard" }
u.me.state        // Record<string,unknown> — all player data (desc, attrs, etc.)
u.me.contents     // IDBObj[] — objects in actor's inventory

// Check permission level
u.me.flags.has("superuser")  // highest — created at first boot
u.me.flags.has("admin")      // or "wizard" — both level 9
u.me.flags.has("player")
u.me.flags.has("connected")  // currently logged in

// Read stored data
const desc  = u.me.state.desc  as string || "You see nothing special.";
const gold  = u.me.state.gold  as number || 0;
const level = u.me.state.level as number || 1;
```

### `u.here` — The Room

The room the actor is currently in. Has an extra `.broadcast()` method.

```typescript
u.here.id        // room ID
u.here.name      // room name
u.here.state     // room data (desc, exits, etc.)
u.here.contents  // IDBObj[] — everyone and everything in the room

// Send to everyone in the room
u.here.broadcast("The lights flicker.");

// Send to everyone in the room (with options)
u.here.broadcast("An explosion rocks the building!", { source: "event" });
```

### `u.target` — Optional Target

Set when the parser resolves a target from the command args. May be `undefined`.

```typescript
if (!u.target) {
  u.send("No target found.");
  return;
}

u.target.id
u.target.name
u.target.flags
u.target.broadcast("Something pokes you.");
```

### `u.cmd` — The Command

```typescript
u.cmd.name       // "look" — the script name that was matched
u.cmd.original   // "@look north" — full string the player typed
u.cmd.args       // ["north", "north"] — [rawArgString, ...splitArgs]
u.cmd.switches   // ["edit"] from "@bbpost/edit ..."  (or undefined)

// Common args pattern:
const arg = (u.cmd.args[0] || "").trim();

// Common switches pattern:
const sw = u.cmd.switches || [];
if (sw.includes("verbose")) { /* ... */ }
```

### `u.state` — Reactive Script State

Per-execution scratch space. Changes are sent back to the server as patches.

```typescript
// Read initial state (usually empty for one-shot scripts)
const prev = u.state.lastRan as number | undefined;

// Write state (patches are sent back automatically via Proxy)
u.state.lastRan = Date.now();
```
---

## Messaging

### `u.send(message, target?, options?)`

Send a message to a player.

```typescript
// To the actor
u.send("You pick up the coin.");

// To a specific player by ID
u.send("Alice picks up a coin.", aliceId);

// With options
u.send("Disconnecting...", undefined, { quit: true });  // triggers disconnect

// MUSH color codes work everywhere
u.send("%ch%cgYou level up!%cn");
u.send(`%ch%cr[ERROR]%cn ${message}`);
```

### `u.broadcast(message, options?)`

Send to **all** connected players on the server. Use sparingly.

```typescript
u.broadcast("The server will reboot in 5 minutes.");
u.broadcast(`%ch%cy[ANNOUNCE]%cn ${announcement}`);
```

### `u.here.broadcast(message, options?)`

Send to everyone in the actor's current room.

```typescript
u.here.broadcast(`${u.util.displayName(u.me, u.me)} arrives.`);
```
---

## Database (`u.db`)

### `u.db.search(query)`

Returns an array of `IDBObj`. Query can be a string (target lookup) or an object.

```typescript
// By name (case-insensitive)
const results = await u.db.search({ "data.name": /alice/i });

// By flag
const wizards = await u.db.search({ flags: /wizard/i });

// All connected players
const online = await u.db.search({ flags: /connected/i });

// Objects in a specific room
const contents = await u.db.search({ location: u.here.id });

// Players in a room (combined)
const players = await u.db.search({ location: u.here.id, flags: /player/i });

// OR query
const found = await u.db.search({
  $or: [
    { "data.name": /alice/i },
    { "data.alias": /alice/i }
  ]
});
```

### `u.db.create(template)`

```typescript
const sword = await u.db.create({
  flags: new Set(["thing", "weapon"]),
  location: u.me.id,   // in actor's inventory
  state: {
    name: "Iron Sword",
    description: "A basic iron sword.",
    damage: 5,
    owner: u.me.id
  }
});
u.send(`You create ${sword.state.name as string} (#${sword.id}).`);
```

### `u.db.modify(id, op, data)`

```typescript
// $set — merge data fields (always spread existing state)
await u.db.modify(u.me.id, "$set", {
  data: { ...u.me.state, gold: (u.me.state.gold as number || 0) + 100 }
});

// $set on any object
await u.db.modify(objectId, "$set", {
  data: { ...targetObj.state, locked: true }
});
```

### `u.db.destroy(id)`

```typescript
await u.db.destroy(objectId);
u.send(`Object #${objectId} destroyed.`);
```
---

## Target Resolution (`u.util.target`)

The standard way to resolve player input into an object.

```typescript
// Accepts: name, ID, alias, "me", "here", partial match
const target = await u.util.target(u.me, inputString);

if (!target) {
  u.send("I can't find that.");
  return;
}
```

The lookup searches:
1. `me` / `here` keywords
2. Actor's inventory (by name/alias)
3. Current room contents (by name/alias)
4. All objects globally (if `global` param is `true`)
---

## Flags (`u.setFlags`)

```typescript
await u.setFlags(target.id, "dark");     // add "dark" flag
await u.setFlags(target.id, "!dark");    // remove "dark" flag
await u.setFlags(target.id, "wizard");   // grant wizard (superuser required)

// Or by object reference
await u.setFlags(u.me, "builder");
```
---

## Permission Check (`u.canEdit`)

```typescript
if (!(await u.canEdit(u.me, target))) {
  u.send("Permission denied.");
  return;
}
// proceed with edit
```

Returns `Promise<boolean>` — `true` if the actor owns the target, or is
admin / wizard / superuser. Always `await` the call; omitting `await`
truthy-tests the Promise object and silently bypasses the check.
---

## Locks (`u.checkLock`)

```typescript
// Evaluate a lock expression against the actor
const canPass = await u.checkLock(target.id, "player+");
const isWiz   = await u.checkLock(u.me.id,   "wizard");

// Lock syntax examples:
// "player+"      — must have player flag
// "wizard|admin" — wizard OR admin
// "!dark"        — must NOT have dark flag
// "#42"          — must be object #42
```
---

## Movement (`u.teleport`)

```typescript
// Move any object to a destination room
u.teleport(u.me.id, destinationId);

// Move an object from inventory to a room
u.teleport(objectId, u.here.id);
```
---

## Execute Commands (`u.execute`, `u.force`)

```typescript
// Run a command as the actor (goes through full command pipeline)
u.execute("look");
u.execute(`say I just arrived!`);

// Force a command (bypasses some permission checks)
u.force("@set me=dark");
u.force(`@teleport #${objectId}=#${roomId}`);
```
---

## Text Storage (`u.text`)

Named text blobs stored in the database. Useful for MOTD, templates, help pages.

```typescript
// Read
const motd = await u.text.read("motd");
if (motd) u.send(motd);

// Write
await u.text.set("motd", "Server maintenance tonight at midnight EST.");

// Clear
await u.text.set("motd", "");
```
---

## Bulletin Boards (`u.bb`)

```typescript
// List boards with unread counts (for current player)
const boards = await u.bb.listBoards();
// → [{ id, name, description, order, postCount, newCount }, ...]

// List posts on a board
const posts = await u.bb.listPosts("announcements");
// → [{ id, num, subject, authorName, date, edited? }, ...]

// Read a specific post by number
const post = await u.bb.readPost("announcements", 3);
if (post) {
  u.send(`Subject: ${post.subject}`);
  u.send(`By: ${post.authorName}`);
  u.send(post.body);
}

// Post to a board
await u.bb.post("announcements", "Game Night Friday!", "Join us at 8pm EST.");

// Edit a post (author or admin)
await u.bb.editPost("announcements", 3, "Updated body text.");

// Delete a post
await u.bb.deletePost("announcements", 3);

// Admin: create a board
await u.bb.createBoard("General", { description: "General discussion", order: 1 });

// Admin: destroy a board (also deletes all posts)
await u.bb.destroyBoard("old-board");

// Mark all posts on a board as read (for current player)
await u.bb.markRead("announcements");

// Unread counts
const boardNew = await u.bb.newPostCount("announcements");  // for one board
const totalNew = await u.bb.totalNewCount();                 // across all boards
```
---

## Mail (`u.mail`)

```typescript
// Send
await u.mail.send({
  id: crypto.randomUUID(),
  from: `#${u.me.id}`,
  to: [`#${recipientId}`],
  cc: [`#${ccId}`],          // optional
  subject: "Guild Meeting",
  message: "Meeting tomorrow at 8pm in the hall.",
  read: false,
  date: Date.now()
});

// Notify recipient (send them an in-game message)
u.send(`%chMAIL:%cn You have new mail from ${u.util.displayName(u.me, u.me)}.`, recipientId);

// Read (query your inbox)
const inbox = await u.mail.read({ to: { $in: [`#${u.me.id}`] } });
inbox.sort((a, b) => a.date - b.date);
const unread = inbox.filter(m => !m.read);

// Delete
await u.mail.delete(messageId);
```
---

## Channels (`u.chan`)

```typescript
// Join (adds to player's channel list + socket room)
await u.chan.join("public", "pub");

// Leave by alias
await u.chan.leave("pub");

// List all channels
const channels = await u.chan.list();

// Admin: create
await u.chan.create("events", {
  header: "[EVENTS]",
  lock: "player+",
  hidden: false
});

// Admin: modify
await u.chan.set("public", {
  header: "[PUB]",
  masking: true   // hide speaker names
});

// Admin: destroy
await u.chan.destroy("events");
```
---

## Attribute Triggers (`u.trigger`)

Run a stored `&ATTR` as a sandbox script, with the enactor as `u.me`.

```typescript
// Fire &ONENTER on the room with no args
await u.trigger(u.here.id, "ONENTER");

// Fire &USE on an object, passing args
await u.trigger(objectId, "USE", ["open"]);

// Fire &ACONNECT on the player
await u.trigger(u.me.id, "ACONNECT");
```
---

## Authentication (`u.auth`)

```typescript
// Verify credentials (returns true/false)
const valid = await u.auth.verify(name, password);

// Complete login (sets connected flag, joins socket rooms, fires hooks)
await u.auth.login(playerId);

// Hash a password
const hashed = await u.auth.hash(plaintext);

// Change password
await u.auth.setPassword(playerId, newPassword);
```
---

## System (`u.sys`)

Wizard/admin only (enforced in each script — the SDK does not enforce it itself).

```typescript
// Set a runtime config value
await u.sys.setConfig("game.masterRoom", "42");

// Disconnect a socket (by socket ID, not player ID)
await u.sys.disconnect(socketId);

// Server uptime in milliseconds
const ms = await u.sys.uptime();
const h  = Math.floor(ms / 3600000);
const m  = Math.floor((ms % 3600000) / 60000);
u.send(`Uptime: ${h}h ${m}m`);

// Reboot (exit code 75 — daemon restart loop restarts the server)
await u.sys.reboot();

// Shutdown (exit code 0)
await u.sys.shutdown();

// Pull latest code from git and restart (runs git pull, then exits 75)
await u.sys.update();            // pull origin/main
await u.sys.update("develop");   // pull a specific branch
```
---

## Events (`u.events`)

Server-wide pub/sub system.

```typescript
// Emit an event with data
await u.events.emit("player.died", {
  id: u.me.id,
  cause: "fell off a cliff"
});

// Subscribe a stored attribute to an event
// The attribute value is a script that receives the event data
const subId = await u.events.on("player.died", "DEATH_HANDLER");
```
---

## Formatting (`u.util`)

### Alignment

```typescript
// Left-pad to width (optional fill character)
u.util.ljust("text", 20)           // "text                "
u.util.ljust("text", 20, ".")      // "text................"

// Right-align
u.util.rjust("100", 20)            // "                 100"

// Center
u.util.center("Title", 40, "-")    // "-------------------Title------------------"
u.util.center("Title", 40)         // "                 Title                  "
```

### sprintf

```typescript
u.util.sprintf("%-10s %5d", "Alice", 1200)   // "Alice       1200"
u.util.sprintf("%.2f%%", 98.6)               // "98.60%"
u.util.sprintf("%05d", 42)                   // "00042"
```

### template

Multi-row column formatter. Uppercase keys are bracketed (`[value]`), lowercase are unbracketed.

```typescript
const out = u.util.template(
  "[NNN] [TTTTTTTTTTTTTTTTTTTT] rrrrr",
  {
    N: { value: "42",        align: "right" },
    T: { value: "Post title", align: "left"  },
    r: { value: "Alice",      align: "left"  }
  }
);
// → "[ 42] [Post title          ] Alice"
```

### resolveFormat / resolveFormatOr

Sandbox-accessible helpers (since v2.3.2) for looking up a format-attr value
on a target, walking the format-handler pipeline.

```typescript
// Look up a per-object NAMEFORMAT. Priority:
//   1. Stored &NAMEFORMAT attribute on the target
//   2. Plugin-registered format handler for that slot
//   3. null
const formatted = await u.util.resolveFormat(target, "NAMEFORMAT", u.me);

// With a fallback string if nothing returns
const line = await u.util.resolveFormatOr(target, "EXITFORMAT", u.me, "[exit]");
```

### resolveGlobalFormat / resolveGlobalFormatOr

Two-tier lookup (since v2.3.3) for "global list" formats like WHO and @ps.
Checks `#0` (the master room object) first, then the enactor.

```typescript
// e.g. inside a WHO script
const row = await u.util.resolveGlobalFormat("WHOROWFORMAT", u.me, [player]);
const fallback = await u.util.resolveGlobalFormatOr("WHOFORMAT", u.me, "");
```

The eight engine-known slots are `NAMEFORMAT`, `DESCFORMAT`, `CONFORMAT`,
`EXITFORMAT`, `WHOFORMAT`, `WHOROWFORMAT`, `PSFORMAT`, `PSROWFORMAT`.
Plugin authors can pass any uppercase slot name (e.g. `"MAILFORMAT"`,
`"BBROWFORMAT"`) without casting. See
[Customization → Format Handlers](./customization.md#format-handlers).

### stripSubs

```typescript
// Remove all MUSH codes and ANSI escapes
u.util.stripSubs("%ch%crDanger!%cn")   // → "Danger!"
u.util.stripSubs("%n waves.")          // → " waves."

// Use before validation or DB storage
const clean = u.util.stripSubs(userInput).trim();
if (!clean) { u.send("Value cannot be empty."); return; }
```

### displayName

```typescript
// Returns moniker (if set) → name → "Unknown"
u.util.displayName(u.me, u.me)       // "Alice" or moniker
u.util.displayName(target, u.me)     // target's display name as seen by actor
```
---

## Attributes (`u.attr`)

### `u.attr.get(id, name)`

Reads a soft-coded `&ATTR` value stored on any game object. Attribute names are
case-insensitive. Returns `null` if the attribute is not set.

```typescript
// Read your own short description
const shortDesc = await u.attr.get(u.me.id, "SHORT-DESC");
if (shortDesc) u.send(`Short desc: ${shortDesc}`);

// Read another object's attribute
const bio = await u.attr.get(targetId, "FINGER-INFO");

// Case-insensitive
const val = await u.attr.get(objectId, "onenter");  // same as "ONENTER"
```
---

## Evaluate Attribute (`u.eval`)

### `u.eval(targetId, attr, args?)`

Evaluates a stored `&ATTR` as a script and returns the output as a string.
This is the script equivalent of `@trigger` that also captures output.

```typescript
// Run &FORMULA on object #42 with args
const result = await u.eval("#42", "FORMULA", ["5", "10"]);
u.send(`Formula result: ${result}`);

// Run an attribute on the actor
const score = await u.eval(u.me.id, "SCORE-FORMULA");
u.send(`Your score: ${score}`);
```
---

## Force As Another Object (`u.forceAs`)

### `u.forceAs(targetId, command)`

Executes a command as another object (NPC, room, etc.). The SDK does not enforce
privilege — always check flags in your script before calling.

```typescript
// Guard: admin/wizard only
const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
if (!isAdmin) { u.send("Permission denied."); return; }

// Make an NPC speak
await u.forceAs(npcId, "say Welcome to the Inn!");

// Make a room run a command
await u.forceAs(roomId, "@trigger me/ONRESET");
```
---

## Game Time (`u.sys.gameTime`)

### `u.sys.gameTime()` / `u.sys.setGameTime(t)`

Read and write the in-game calendar. Useful for seasonal events, timestamps,
and roleplay-relevant date display.

```typescript
// Read current game time
const t = await u.sys.gameTime();
// t.year: number, t.month: 1-12, t.day: 1-28, t.hour: 0-23, t.minute: 0-59

const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
u.send(`Today is ${monthNames[t.month]} ${t.day}, Year ${t.year} — ${t.hour}:${String(t.minute).padStart(2,"0")}`);

// Advance the calendar (admin only)
if (!u.me.flags.has("wizard") && !u.me.flags.has("admin")) {
  u.send("Permission denied."); return;
}
await u.sys.setGameTime({ year: t.year + 1, month: 1, day: 1, hour: 0, minute: 0 });
u.broadcast("A new year has begun!");
```
---

## Channel History (`u.chan.history`)

### `u.chan.history(name, limit?)`

Fetches recent messages from a channel. Default limit is 20.

```typescript
// Last 20 messages on the public channel
const history = await u.chan.history("public");
// → [{ id: string, playerName: string, message: string, timestamp: number }, ...]

// Last 50 messages
const history = await u.chan.history("staff", 50);

// Display as a log
const lines = history.map(e => {
  const date = new Date(e.timestamp).toLocaleTimeString();
  return `[${date}] ${e.playerName}: ${e.message}`;
});
u.send(lines.join("\r\n"));
```
---

## Mail — Modify (`u.mail.modify`)

### `u.mail.modify(query, op, update)`

Updates mail records matching `query`. Used for marking messages read/unread or
other bulk updates. Available in sandbox scripts only.

```typescript
// Mark a specific message as read
await u.mail.modify({ id: messageId }, "$set", { read: true });

// Mark all your messages as read
await u.mail.modify(
  { to: { $in: [`#${u.me.id}`] } },
  "$set",
  { read: true }
);
```
