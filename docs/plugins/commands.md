---
layout: layout.vto
description: Registering and writing in-game commands in UrsaMU plugins
---

# Commands in Plugins

## Command Basics

Commands are registered with `addCmd` at **module-load time** — not inside
`init()`. The standard pattern is:

1. Create `commands.ts` in your plugin folder and call `addCmd` there.
2. Add `import "./commands.ts"` in `index.ts` so registrations happen when the
   plugin is loaded.

When a player types input, the command parser checks it against every
registered pattern in turn and calls the first matching `exec` function.
---

## addCmd Reference

```typescript
// In a plugin inside src/plugins/:
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

// From a child game (outside src/):
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

addCmd({
  name: "+myplugin",          // unique identifier — shown in logs
  pattern: /^\+myplugin(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",          // lock expression
  exec: async (u: IUrsamuSDK) => {
    // your logic here
  },
});
```

### `name`

A unique string identifier. By convention:

- Prefix admin/world-manipulation commands with `@` (e.g., `@dig`, `@name`)
- Prefix player feature commands with `+` (e.g., `+bb`, `+event`, `+job`)

### `pattern`

A `RegExp` matched against the full input string. Capture groups become
`u.cmd.args[0]`, `u.cmd.args[1]`, etc.

The standard switch pattern for `+cmd/switch <args>`:

```typescript
pattern: /^\+cmd(?:\/(\S+))?\s*(.*)/i
//                  ^^^^^^    ^^
//               args[0]: sw  args[1]: rest
```

### `lock`

Controls who can run the command. The player must satisfy the lock expression.

| Value | Meaning |
|-------|---------|
| `""` | No restriction (login-screen commands only) |
| `"connected"` | Player must be logged in |
| `"connected builder+"` | Connected + builder flag or higher |
| `"connected admin+"` | Connected + admin flag or higher |
| `"connected wizard"` | Connected + wizard flag |

### `exec`

The function called on match. Receives `u: IUrsamuSDK` — the same SDK object
available to sandbox scripts.
---

## The IUrsamuSDK Object

### Identity

```typescript
u.me.id           // actor's DB ID
u.me.name         // actor's name (string)
u.me.flags        // Set<string> of flags
u.me.location     // current room ID
u.socketId        // WebSocket connection ID
```

### Command input

```typescript
u.cmd.args[0]     // first capture group from pattern (often the switch)
u.cmd.args[1]     // second capture group (often the rest of input)
```

### Messaging

```typescript
u.send("Message to caller");
u.broadcast("Message to everyone in the room");
```

### Database

```typescript
// Search the main objects DB
const players = await u.db.search({ flags: /connected/i });

// Create an object
const obj = await u.db.create({
  name: "Widget", flags: new Set(["thing"]),
  location: u.me.location, state: {}, contents: [],
});

// Modify a field
await u.db.modify(obj.id, "$set", { data: { description: "Updated" } });

// Destroy an object
await u.db.destroy(obj.id);
```

### Target resolution

```typescript
const tar = await u.util.target(u.me, u.cmd.args[1]);
if (!tar) { u.send("I don't see that here."); return; }
```

`u.util.target` searches the room contents and the actor's inventory.

### Permissions

```typescript
const isAdmin = u.me.flags.has("admin") ||
                u.me.flags.has("wizard") ||
                u.me.flags.has("superuser");

if (!isAdmin) { u.send("Permission denied."); return; }
```

### Utility helpers

```typescript
u.util.stripSubs(str)     // strip MUSH color codes and ANSI escapes
u.util.ljust(str, width)  // left-pad to width
u.util.rjust(str, width)  // right-pad to width
u.util.center(str, width) // center in width
```

### u.mail, u.attr, u.eval, u.forceAs

These are also available in the `u` object. See the
[SDK Cookbook](../guides/sdk-cookbook.md) for full examples:

| Method | Description |
|--------|-------------|
| `u.attr.get(id, name)` | Read a soft-coded &ATTR value (returns `string \| null`) |
| `u.eval(targetId, attr, args?)` | Evaluate &ATTR and return output as string |
| `u.forceAs(targetId, cmd)` | Execute command as another object (wizard/admin only) |
| `u.sys.gameTime()` | Read in-game calendar (`IGameTime`) |
| `u.sys.setGameTime(t)` | Set in-game calendar |
| `u.chan.history(name, limit?)` | Recent channel messages |
| `u.mail.send/read/delete/modify` | Mail system (sandbox scripts only) |
---

## Pattern Reference

### Simple command, no arguments

```typescript
pattern: /^inventory$/i
// "inventory" → u.cmd.args: []
```

### Command with one argument

```typescript
pattern: /^look\s+(.*)/i
// "look north" → u.cmd.args[0]: "north"
```

### Command with switch and argument

```typescript
pattern: /^\+job(?:\/(\S+))?\s*(.*)/i
// "+job/view 5" → args[0]: "view", args[1]: "5"
// "+job"        → args[0]: "",     args[1]: ""
```

### Command with two arguments separated by `=`

```typescript
pattern: /^\+event\/edit\s+(\d+)\/(\S+)=(.+)/i
// "+event/edit 3/title=New Title" → args[0]: "3", args[1]: "title", args[2]: "New Title"
```
---

## Switch Handling

The standard idiom for switch-based commands:

```typescript
addCmd({
  name: "+ticket",
  pattern: /^\+ticket(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    if (!sw || sw === "list") {
      // +ticket or +ticket/list
      u.send("Listing tickets ...");
      return;
    }

    if (sw === "view") {
      // +ticket/view <num>
      const num = parseInt(arg, 10);
      if (isNaN(num)) { u.send("Usage: +ticket/view <#>"); return; }
      u.send(`Viewing ticket #${num}`);
      return;
    }

    if (sw === "create") {
      // +ticket/create <title>
      if (!arg) { u.send("Usage: +ticket/create <title>"); return; }
      u.send(`Creating ticket: ${arg}`);
      return;
    }

    u.send(`Unknown switch "/${sw}". Try: +ticket, +ticket/view, +ticket/create`);
  },
});
```
---

## Examples

### Minimal broadcast command

```typescript
addCmd({
  name: "+shout",
  pattern: /^\+shout\s+(.*)/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    const msg = u.cmd.args[0]?.trim();
    if (!msg) { u.send("Shout what?"); return; }
    u.send(`You shout: "${msg}"`);
    u.broadcast(`${u.me.name} shouts: "${msg}"`);
  },
});
```

### Staff-only admin command

```typescript
addCmd({
  name: "@wipe",
  pattern: /^@wipe\s+(.*)/i,
  lock: "connected admin+",
  exec: async (u: IUrsamuSDK) => {
    const tar = await u.util.target(u.me, u.cmd.args[0]);
    if (!tar) { u.send("I don't see that."); return; }
    if (tar.flags.has("superuser")) {
      u.send("You cannot wipe a superuser."); return;
    }
    await u.db.destroy(tar.id);
    u.send(`Destroyed ${tar.name}.`);
  },
});
```

### Command that reads and writes a custom DBO

```typescript
// Plugin in src/plugins/ — use relative imports
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { myRecords } from "./db.ts";

addCmd({
  name: "+record",
  pattern: /^\+record(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase();
    const arg = (u.cmd.args[1] || "").trim();

    if (sw === "list") {
      const all = await myRecords.find({ playerId: u.me.id });
      if (!all.length) { u.send("No records."); return; }
      for (const r of all) u.send(`[${r.id.slice(-4)}] ${r.text}`);
      return;
    }

    if (!arg) { u.send("Usage: +record <text>"); return; }

    await myRecords.create({
      id:        crypto.randomUUID(),
      playerId:  u.me.id,
      text:      arg,
      createdAt: Date.now(),
    });
    u.send("Saved.");
  },
});
```
