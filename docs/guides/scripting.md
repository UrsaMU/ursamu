---
layout: layout.vto
title: Scripting Guide
description: How to write and run scripts in UrsaMU's sandboxed scripting environment
---

# Scripting Guide

UrsaMU scripts are TypeScript/JavaScript files that run inside **Web Workers** — completely isolated from the host process. Scripts interact with the game world through a typed SDK called the **UrsaMU SDK** (`u`).

## How Scripting Works

When a player triggers a script (via an object, command, or trigger), the Sandbox Service:

1. Spins up a Web Worker
2. Injects the SDK as the global `u` object
3. Injects the execution environment as `en` (the entity context)
4. Runs the script
5. Collects results and sends them back to the hub

Scripts are isolated — they **cannot** crash the server, access the filesystem, or open network connections directly. Everything goes through the SDK.

## The Execution Context (`en`)

Every script receives an `en` (entity/environment) object describing who triggered it and where:

```typescript
en.id        // ID of the actor (player or object running the script)
en.name      // Display name of the actor
en.location  // ID of the room the actor is in
en.cmd       // Command string that triggered the script
en.args      // Argument string passed to the command
en.switches  // Object of switches used (e.g. { verbose: true })
en.socket    // Socket ID of the triggering connection
en.cid       // Character ID (if connected player)
```

## The SDK (`u`)

The SDK is available as the global `u` object. It provides namespaced groups of functions:

### `u.emit` — Sending Messages

```typescript
// Send a message to the triggering player only
await u.emit.send("You look around.");

// Broadcast to everyone in a room
await u.emit.broadcast(roomId, "Someone waves.");

// Broadcast to everyone EXCEPT a player
await u.emit.broadcastExcept(roomId, actorId, "Alice waves.");
```

### `u.db` — Database Access

```typescript
// Get an object by ID
const room = await u.db.get(en.location);
console.log(room.name); // "The Grand Hall"

// Search objects by query
const players = await u.db.search({ flags: /player/i });

// Modify an object
await u.db.modify(en.id, { data: { ...currentData, score: 100 } });

// Create a new object
const obj = await u.db.create({
  flags: new Set(["thing"]),
  data: { name: "A Coin", description: "A shiny gold coin." },
  location: en.location,
});

// Destroy an object
await u.db.destroy(objId);
```

### `u.move` — Moving Objects

```typescript
// Move actor to a new location
await u.move.move(en.id, destinationRoomId);

// Get the exit that leads to a room
const exit = await u.move.getExit(en.location, "north");
```

### `u.chan` — Channel Operations

```typescript
// Send a message to a channel
await u.chan.send("public", `[Public] ${en.name}: Hello!`);

// Create a channel (admin/wizard only)
await u.chan.create("newchannel", { header: "[New]" });

// Destroy a channel (admin/wizard only)
await u.chan.destroy("oldchannel");

// Set channel properties (admin/wizard only)
await u.chan.set("mychannel", "header", "[MyChan]");
```

### `u.ui` — Structured UI Output

```typescript
// Send a structured layout to a web client
u.ui.layout({
  type: "table",
  data: [
    { col1: "Name", col2: "Score" },
    { col1: "Alice", col2: "1200" },
  ],
});
```

### `u.auth` — Authentication

```typescript
// Hash a password
const hashed = await u.auth.hash("mypassword");

// Verify a password
const valid = await u.auth.setPassword(en.id, "newpassword");
```

### `u.sys` — System Controls (Wizard Only)

```typescript
// Restart the server
await u.sys.reboot();

// Shutdown the server
await u.sys.shutdown();
```

### `u.util` — Utilities

```typescript
// Strip MUSH color codes and ANSI escapes
const clean = u.util.stripSubs("%chHello%cn %cgWorld%cn");
// → "Hello World"

// Pad/align text
const centered  = u.util.center("Title", 40, "-");
const leftAlign = u.util.ljust("Left", 20);
const rightAlign = u.util.rjust("Right", 20);

// sprintf-style formatting
const formatted = u.util.sprintf("%-10s %5d", "Player", 1200);

// String interpolation
const msg = u.util.template("Welcome, {name}!", { name: en.name });
```

## Writing a Script

Scripts are TypeScript (or JavaScript) files stored in `system/scripts/`. They can use either **ESM module syntax** or **legacy block mode**.

### ESM Style (Recommended)

Files with an `export` statement are detected as ESM modules:

```typescript
// system/scripts/greet.ts
export {};  // signals ESM mode

const target = en.args.trim() || "World";
await u.emit.send(`Hello, ${target}!`);
await u.emit.broadcast(en.location, `${en.name} says hello to ${target}.`);
```

### Legacy Block Style

Files without exports run as a simple code block:

```typescript
// system/scripts/score.ts
const me = await u.db.get(en.id);
const score = me.data?.score ?? 0;
await u.emit.send(`Your score: ${score}`);
```

## Registering a Script as a Command

Scripts become commands by registering them in `system/scripts/index.ts` (or via a plugin):

```typescript
import { registerCommand } from "../../services/Commands/mod.ts";

registerCommand({
  name: "greet",
  pattern: "greet *",
  flags: "connected",
  exec: async (ctx) => {
    await runScript("greet", ctx);
  },
});
```

Or using the inline exec form:

```typescript
registerCommand({
  name: "score",
  pattern: "score",
  flags: "connected",
  exec: async (ctx) => {
    const me = await dbojs.get(ctx.player.id);
    const score = me?.data?.score ?? 0;
    ctx.send(`Your score: ${score}`);
  },
});
```

## Testing Scripts

Scripts can be tested using `deno test`. The pattern is to:

1. Read the script file
2. Strip imports/exports with `wrapScript()`
3. Create a mock `en` and `u` environment
4. Execute the script and assert on outputs

```typescript
// tests/my_script.test.ts
import { assertEquals } from "jsr:@std/assert";
import { wrapScript } from "./helpers.ts";

Deno.test("greet script sends hello", async () => {
  const script = await Deno.readTextFile("system/scripts/greet.ts");
  const wrapped = wrapScript(script);

  const sent: string[] = [];
  const env = {
    en: { id: "p1", name: "Alice", location: "r1", args: "Bob" },
    u: {
      emit: {
        send: (msg: string) => { sent.push(msg); },
        broadcast: () => {},
      },
      // ... other SDK stubs
    },
  };

  await new Function("en", "u", `return (async () => { ${wrapped} })()`)(
    env.en, env.u
  );

  assertEquals(sent[0], "Hello, Bob!");
});
```

## Security Model

| Capability | Available in Script? |
|-----------|---------------------|
| File system access | No |
| Network requests | No |
| Host process access | No |
| Database (via SDK) | Yes |
| Messaging (via SDK) | Yes |
| Channel ops (via SDK) | Yes |
| System commands (wizard only) | Conditional |
| Custom ESM imports (same worker) | Yes |
| JSR sub-path imports | Limited |

Scripts run inside Web Workers with `/// <reference no-default-lib="true" />`, preventing access to `Deno.*`, `fetch()`, and the filesystem.

## MUSH Color Codes

UrsaMU supports the traditional MUSH color substitution syntax for player-facing text:

| Code | Meaning |
|------|---------|
| `%ch` | Bold/bright |
| `%cn` | Reset/normal |
| `%cr` | Red |
| `%cg` | Green |
| `%cb` | Blue |
| `%cy` | Yellow |
| `%cw` | White |
| `%cc` | Cyan |
| `%cm` | Magenta |
| `%n` | Player name substitute |
| `%r` / `%R` | Newline |
| `%t` | Tab |
| `%b` | Space |

Use `u.util.stripSubs(text)` to strip all color codes (useful for validation or storage).
