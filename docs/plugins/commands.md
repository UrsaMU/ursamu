---
layout: layout.vto
description: Learn how to create commands in UrsaMU plugins
nav:
  - text: Command Basics
    url: "#command-basics"
  - text: Command Structure
    url: "#command-structure"
  - text: Registering Commands
    url: "#registering-commands"
  - text: The SDK Object
    url: "#the-sdk-object"
  - text: Command Patterns
    url: "#command-patterns"
  - text: Examples
    url: "#examples"
---

# Creating Commands in UrsaMU Plugins

This guide explains how to create and register commands in your UrsaMU plugins using the `addCmd` API.

## Command Basics

Commands are the primary way players interact with UrsaMU. When a player types a command, UrsaMU matches it against registered patterns and calls the corresponding `exec` function with a fully populated SDK object (`u`).

Plugin commands use the **same `IUrsamuSDK` API** as system scripts in `system/scripts/`, so everything you can do in a script you can do in a plugin command.

## Command Structure

Commands are defined using the `ICmd` interface:

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

addCmd({
  name: "hello",              // Unique command identifier
  pattern: /^hello\s*(.*)/i, // Regex — capture groups become u.cmd.args
  lock: "connected",          // Lock expression (empty = no restriction)
  help: "Greet the world",    // Optional help text
  category: "social",         // Optional category for help listings
  exec: async (u: IUrsamuSDK) => {
    const target = u.cmd.args[0]?.trim() || "world";
    u.send(`Hello, ${target}!`);
  },
});
```

### `name`

A unique string identifier for the command. Used in help listings and error messages.

### `pattern`

A `RegExp` that is matched against the player's input. Capture groups (parentheses) are passed as `u.cmd.args`. For example:

```typescript
pattern: /^give\s+(.*)\s*=\s*(.*)/i
// u.cmd.args[0] → item name
// u.cmd.args[1] → recipient name
```

### `lock`

A lock expression that controls who can run the command. The player must pass the lock to execute it. Common values:

- `""` — no restriction (login screen commands like `create`, `connect`)
- `"connected"` — must be logged in
- `"connected builder+"` — connected and builder flag or higher
- `"connected admin+"` — connected and admin flag or higher
- `"connected wizard"` — connected and wizard flag

### `exec`

The function called when the command matches. Receives a single `u: IUrsamuSDK` argument.

## Registering Commands

Call `addCmd` anywhere in your plugin's initialization code. Commands are registered globally and persist for the lifetime of the server process.

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

// Register one command
addCmd({
  name: "ping",
  pattern: /^ping$/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    u.send("Pong!");
  },
});

// Register multiple commands at once
addCmd(
  {
    name: "north",
    pattern: /^n(?:orth)?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => { await u.force("go north"); },
  },
  {
    name: "south",
    pattern: /^s(?:outh)?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => { await u.force("go south"); },
  }
);
```

## The SDK Object

Your `exec` function receives `u: IUrsamuSDK` — the same object available to `system/scripts/` sandbox scripts.

### Who am I?

```typescript
exec: (u: IUrsamuSDK) => {
  const myId = u.me.id;                          // Actor's DB ID
  const myName = String(u.me.state.name ?? "?"); // Actor's name
  const myFlags = u.me.flags;                    // Set<string> of flags
  const myLocation = u.me.location;              // Current room ID
  const socketId = u.socketId;                   // WebSocket connection ID
}
```

### Command arguments

```typescript
// Pattern: /^score\s*(.*)/i
exec: (u: IUrsamuSDK) => {
  const rawArg = u.cmd.args[0];         // Everything after "score "
  const switches = u.cmd.switches;      // e.g. ["brief"] from "score/brief"
  const original = u.cmd.original;      // Full original input
}
```

### Sending messages

```typescript
exec: (u: IUrsamuSDK) => {
  u.send("This goes to you.");
  u.send("This goes to another player.", otherPlayerId);
  u.broadcast("Everyone in this room sees this.");
  u.here.broadcast("Also everyone in this room.");
}
```

### Finding targets

```typescript
exec: async (u: IUrsamuSDK) => {
  const tar = await u.util.target(u.me, u.cmd.args[0]);
  if (!tar) return u.send("I can't find that.");

  u.send(`You see: ${u.util.displayName(tar, u.me)}`);
}
```

### Database operations

```typescript
exec: async (u: IUrsamuSDK) => {
  // Search
  const results = await u.db.search({ flags: /player/i });

  // Create
  const obj = await u.db.create({
    name: "Widget",
    flags: new Set(["thing"]),
    location: u.me.location,
    state: { description: "A widget" },
    contents: [],
  });

  // Modify
  await u.db.modify(obj.id, "$set", { data: { description: "Updated" } });

  // Delete
  await u.db.destroy(obj.id);
}
```

### Permissions

```typescript
exec: async (u: IUrsamuSDK) => {
  const tar = await u.util.target(u.me, u.cmd.args[0]);
  if (!tar) return u.send("Not found.");

  if (!await u.canEdit(u.me, tar)) {
    return u.send("Permission denied.");
  }
  // ... proceed
}
```

### System operations

```typescript
exec: async (u: IUrsamuSDK) => {
  // Run a command as the current player
  await u.force("look");
  await u.execute("inventory");

  // Teleport
  await u.teleport(u.me.id, destinationRoomId);

  // Set flags
  await u.setFlags(u.me, "builder");

  // Disconnect a player
  await u.sys.disconnect(targetPlayerId);
}
```

## Command Patterns

Patterns are regular expressions. Capture groups become entries in `u.cmd.args`.

### Simple command

```typescript
pattern: /^inventory$/i
// Matches: "inventory"
// u.cmd.args: []
```

### Command with one argument

```typescript
pattern: /^look\s+(.*)/i
// Matches: "look <target>"
// u.cmd.args[0]: target string
```

### Command with two arguments

```typescript
pattern: /^give\s+(.*)\s*=\s*(.*)/i
// Matches: "give <item>=<recipient>"
// u.cmd.args[0]: item
// u.cmd.args[1]: recipient
```

### Command with switches

Switches are parsed from the command name by the cmdParser before reaching your `exec`. Use `/switch` in input:

```typescript
// Player types: "@set/quiet myobj=flag"
exec: (u: IUrsamuSDK) => {
  if (u.cmd.switches?.includes("quiet")) {
    // quiet mode
  }
}
```

## Examples

### Simple greeting command

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

addCmd({
  name: "greet",
  pattern: /^greet\s*(.*)/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    const target = u.cmd.args[0]?.trim() || "world";
    u.send(`Hello, ${target}!`);
  },
});
```

### Command with target lookup

```typescript
addCmd({
  name: "inspect",
  pattern: /^inspect\s+(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const tar = await u.util.target(u.me, u.cmd.args[0]);
    if (!tar) return u.send("You don't see that here.");

    const name = u.util.displayName(tar, u.me);
    const desc = String(tar.state.description || "You see nothing special.");
    u.send(`${name}\n${desc}`);
  },
});
```

### Async command with database access

```typescript
addCmd({
  name: "who",
  pattern: /^who$/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const players = await u.db.search({ flags: /connected/i });

    if (players.length === 0) {
      return u.send("No one is connected.");
    }

    const names = players
      .map((p) => String(p.state.name ?? p.id))
      .join(", ");

    u.send(`Connected players: ${names}`);
  },
});
```

### Admin command with permission check

```typescript
addCmd({
  name: "@nuke",
  pattern: /^@nuke\s+(.*)/i,
  lock: "connected admin+",
  exec: async (u: IUrsamuSDK) => {
    const tar = await u.util.target(u.me, u.cmd.args[0]);
    if (!tar) return u.send("Not found.");

    if (tar.flags.has("superuser")) {
      return u.send("You cannot nuke a superuser.");
    }

    await u.db.destroy(tar.id);
    u.send(`Destroyed ${u.util.displayName(tar, u.me)}.`);
  },
});
```

### Command with room broadcast

```typescript
addCmd({
  name: "shout",
  pattern: /^shout\s+(.*)/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    const message = u.cmd.args[0];
    const name = String(u.me.state.name ?? u.me.id);

    u.send(`You shout: "${message}"`);
    u.here.broadcast(`${name} shouts: "${message}"`, {
      exclude: [u.socketId ?? ""],
    });
  },
});
```
