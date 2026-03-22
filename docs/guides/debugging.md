---
layout: layout.vto
title: Debugging Scripts
description: How to diagnose and fix issues in UrsaMU scripts and plugins.
nav:
  - text: Overview
    url: "#overview"
  - text: Common Mistakes
    url: "#common-mistakes"
  - text: Script Errors
    url: "#script-errors"
  - text: Debugging Techniques
    url: "#debugging-techniques"
  - text: Testing Scripts Manually
    url: "#testing-scripts-manually"
  - text: Plugin Debugging
    url: "#plugin-debugging"
---

# Debugging Scripts

Scripts run in isolated Web Workers. This means you can't use the browser
console, Deno's `--inspect` flag, or filesystem access. Here's how to diagnose
and fix issues.

---

## Overview

When a script fails, the error is:
1. Caught by the sandbox
2. Sent back as an `error` message from the worker
3. Logged to the server console with `[Sandbox] error:`
4. Not shown to the player (the script simply produces no output)

So a script that silently does nothing is often one that **threw an exception**.

---

## Common Mistakes

### 1. Missing `await` on async methods

**Wrong:**
```typescript
const gold = u.me.state.gold as number || 0;
u.db.modify(u.me.id, "$set", { "data.gold": gold + 10 });  // ← missing await!
u.send(`Gold updated.`);
```

**Correct:**
```typescript
const gold = u.me.state.gold as number || 0;
await u.db.modify(u.me.id, "$set", { "data.gold": gold + 10 });
u.send(`Gold updated.`);
```

Missing `await` means the DB write starts but the script may exit before it
completes. In practice you'll often see partial results or no effect.

### 2. Wrong `u.db.modify()` operator

**Wrong:**
```typescript
await u.db.modify(u.me.id, "state", { gold: 100 });    // "state" is not a valid op
await u.db.modify(u.me.id, "name", "Alice");            // "name" is not a valid op
```

**Correct:**
```typescript
await u.db.modify(u.me.id, "$set", { "data.gold": 100 });
await u.db.modify(u.me.id, "$set", { name: "Alice" });
```

Valid ops: `"$set"`, `"$unset"`, `"$inc"`. Any other string is silently rejected.

### 3. Missing `await` on `u.canEdit()`

**Wrong:**
```typescript
if (!u.canEdit(u.me, target)) {   // ← returns Promise, not boolean!
  u.send("Permission denied.");
  return;
}
```

**Correct:**
```typescript
if (!(await u.canEdit(u.me, target))) {
  u.send("Permission denied.");
  return;
}
```

### 4. Clobbering state on modify

**Wrong:**
```typescript
// This wipes all other fields in data!
await u.db.modify(u.me.id, "$set", { data: { gold: 100 } });
```

**Correct:**
```typescript
// Spread to preserve existing fields
await u.db.modify(u.me.id, "$set", { data: { ...u.me.state, gold: 100 } });
// Or use dot-notation to target one field:
await u.db.modify(u.me.id, "$set", { "data.gold": 100 });
```

### 5. ESM import that doesn't work in workers

**Wrong:**
```typescript
import { sprintf } from "jsr:@std/fmt/printf";  // ← JSR sub-path, won't resolve
```

**Correct:**
```typescript
// Use u.util.sprintf instead — it's already in the sandbox
u.util.sprintf("%-10s %5d", "Score", 100);
```

Standard ESM imports (`import X from "https://..."`) work, but `jsr:` package
sub-paths do not resolve in Web Worker context. Use `u.util` helpers instead.

### 6. Assuming `u.db.search()` returns one item

```typescript
const player = await u.db.search({ "data.name": /alice/i });
// player is IDBObj[], not IDBObj!
if (!player) { ... }  // wrong — an empty array is truthy

// Correct:
const results = await u.db.search({ "data.name": /alice/i });
if (!results.length) { u.send("Not found."); return; }
const player = results[0];
```

### 7. Not checking for null from `u.util.target()`

```typescript
const target = await u.util.target(u.me, u.cmd.args[0]);
u.send(`Target: ${target.name}`);  // throws if target is undefined!

// Correct:
const target = await u.util.target(u.me, u.cmd.args[0]);
if (!target) { u.send("I don't see that."); return; }
u.send(`Target: ${target.name}`);
```

---

## Script Errors

### Script produces no output

**Causes:**
- Unhandled exception (check server console for `[Sandbox] error:`)
- Script returned early due to a condition check
- `u.send()` called with undefined/null message

**Diagnose:**
```typescript
// Add a breadcrumb at the start to verify the script is running
u.send("DEBUG: script started");

// Check every early return
const target = await u.util.target(u.me, u.cmd.args[0]);
u.send(`DEBUG: target = ${target?.id ?? "null"}`);
if (!target) { u.send("Not found."); return; }
```

### Script times out

Scripts have a 5-second execution timeout. If your script makes many DB
calls in a loop, it may time out.

**Signs:** Server logs `Script execution timed out`

**Fix:** Batch queries instead of looping:
```typescript
// Bad: N sequential queries
for (const id of playerIds) {
  const p = await u.db.search({ id });  // one query per player
}

// Better: one query
const players = await u.db.search({ location: u.here.id, flags: /player/i });
```

### Worker crashes silently

If the worker throws before any `u.send()`, the player sees nothing. The server
console will show the error.

**Watch for:**
- `ReferenceError: X is not defined` — JSR import that failed to resolve
- `TypeError: Cannot read properties of undefined` — null/undefined not checked
- `SyntaxError` — TypeScript that failed to transpile

---

## Debugging Techniques

### Use `think` to echo values

The `think` command (`system/scripts/think.ts`) sends output to you without
broadcasting. Use it as a debug probe:

```
think [output of a long expression]
```

### Add temporary `u.send()` breadcrumbs

```typescript
export default async (u: IUrsamuSDK) => {
  u.send("[DEBUG 1] entering script");
  const target = await u.util.target(u.me, u.cmd.args[0]);
  u.send(`[DEBUG 2] target = ${target?.id ?? "null"}`);
  if (!target) return;

  const gold = (target.state.gold as number) || 0;
  u.send(`[DEBUG 3] gold = ${gold}`);

  await u.db.modify(target.id, "$set", { "data.gold": gold + 10 });
  u.send("[DEBUG 4] db.modify done");
};
```

Remove the debug lines before committing.

### Check the server console

The server logs all sandbox errors. Look for lines like:
```
[Sandbox] error: TypeError: Cannot read properties of undefined (reading 'id')
```

### Use `@js` for quick experiments (wizard/admin only)

The `@js` command runs a JavaScript expression directly (no sandbox — full
server access). Useful for testing DB queries:

```
@js await dbojs.queryOne({ id: "1" })
```

---

## Testing Scripts Manually

### Run the test suite

```bash
deno task test
```

This runs tests in `tests/`, `src/services/Intents/`, `src/services/Sandbox/`,
and `src/plugins/events/`.

### Write a script test

Tests for scripts follow this pattern — read the file, strip the `export`,
inject a stub `u` object, and run the code:

```typescript
import { assertEquals } from "jsr:@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("greet script sends a message", OPTS, async () => {
  const sent: string[] = [];

  const u = {
    me: { id: "1", name: "Alice", flags: new Set(["player"]), state: {}, contents: [] },
    here: { id: "2", name: "Hall", state: {}, contents: [], flags: new Set(["room"]),
      broadcast: () => {} },
    cmd: { name: "greet", args: ["Bob"], switches: [] },
    state: {},
    send: (msg: string) => { sent.push(msg); },
    util: {
      target: async () => ({ id: "3", name: "Bob", flags: new Set(["player"]),
        state: {}, contents: [] }),
      displayName: (obj: { name?: string }) => obj.name ?? "Unknown",
    },
    db: {
      search: async () => [],
      modify: async () => {},
    },
  } as unknown;

  // Load and run the script
  const src = await Deno.readTextFile("system/scripts/greet.ts");
  const fn = new Function("u", src.replace(/^export default/, "return"));
  await fn(u)(u);

  assertEquals(sent[0], "You wave to Bob.");
});
```

---

## Plugin Debugging

### Check if your plugin loaded

Look for your plugin's init log in the server console:
```
[myplugin] Plugin initialized — +myplugin commands active
```

If missing, the plugin file wasn't found or threw during import.

### Verify `addCmd` was called

Add a console.log to your `commands.ts`:
```typescript
console.log("[myplugin] registering commands");
addCmd({ ... });
```

This should appear at startup before `Plugin initialized`.

### Route not responding

If your `registerPluginRoute` handler isn't called:
- Verify the path starts with `/api/v1/`
- Check that `registerPluginRoute` is called inside `init()`, not at module level
- Confirm the auth header is present (`Authorization: Bearer <jwt>`)

### GameHooks not firing

If `gameHooks.on()` isn't triggering:
- Verify you're calling `on()` in `init()` and storing the handler reference
- Check that `off()` isn't being called before the event fires
- Confirm the event name matches exactly (case-sensitive)
