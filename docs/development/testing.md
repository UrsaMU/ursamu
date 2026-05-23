---
layout: layout.vto
title: Testing
description: How to run the UrsaMU test suite and write tests for commands, scripts, and plugins.
---

# Testing

UrsaMU uses [Deno's built-in test runner](https://docs.deno.com/runtime/fundamentals/testing/).
The v2.6.0 suite is **1141+ passing, 0 failing** across 348 lint-clean files —
covering authentication, command parsing, sandbox scripting, softcode evaluation,
plugin lifecycle, WebSocket rate limiting, scene export, format handlers,
plugin install atomicity, and security regression tests.
---

## Running Tests

```bash
# Full test suite
deno task test

# With LCOV coverage report
deno task test:coverage

# Single file
deno test --allow-all --unstable-kv --no-check tests/auth.test.ts

# Filter by test name
deno test --allow-all --unstable-kv --no-check --filter "auth login"
```

> Always use `--no-check` — the suite is large and type-checking adds significant overhead
> with no benefit for test runs.

---

## Test Structure

```
tests/
├── auth.test.ts               # JWT auth, login, rate limiting
├── gameclock.test.ts          # In-game calendar & time
├── plugin_deps.test.ts        # Plugin loading & manifest
├── queue_scene_discord.test.ts# Async queue, scenes, Discord hooks
├── scripts_attrs.test.ts      # @set, @examine, @describe, @flags, @name
├── scripts_comms.test.ts      # say, pose, who, score
├── scripts_identity.test.ts   # connect, create, quit
├── scripts_interaction.test.ts# drop, give, get, trigger
├── scripts_world.test.ts      # look, dig, go (exit matching)
├── websocket_e2e.test.ts      # Lifecycle, rate limit, broadcast, disconnect
└── …
```

---

## Required Test Options

When a test imports anything from the service layer (e.g. `cmdParser`, `DBO`, `sandboxService`),
use these options to suppress Deno's resource-leak and pending-op warnings:

```typescript
const OPTS = {
  sanitizeResources: false,
  sanitizeOps: false,
};

Deno.test({ name: "my test", ...OPTS, fn: async () => { … } });
```

`cmdParser` triggers async file reads at init and never fully closes them, which would
otherwise cause every test that imports it to fail sanitization.

---

## Testing System Scripts

System scripts (`system/scripts/*.ts`) are TypeScript files that default-export an
async function `(u: IUrsamuSDK) => void`. They can be tested directly by importing
them and calling them with a mock SDK object.

### Basic pattern

```typescript
import script from "../system/scripts/say.ts";

Deno.test({ name: "say", ...OPTS, fn: async () => {
  let sent = "";
  let broadcast = "";

  const u = {
    me: { id: "p1", name: "Alice", flags: new Set(["connected"]), state: {}, contents: [] },
    cmd: { args: ["Hello world"], switches: [] },
    send: (msg: string) => { sent += msg; },
    emit: (msg: string) => { broadcast += msg; },
    // … add other stubs as needed
  } as any;

  await script(u);

  if (!sent.includes("You say")) throw new Error("Missing 'You say' echo");
  if (!broadcast.includes("Alice says")) throw new Error("Missing broadcast");
}});
```

### wrapScript — running scripts as legacy blocks

When a script needs access to the full Sandbox (e.g. scripts that call `u.db.*`
or `u.ui.layout()`), use `wrapScript` to strip the `import`/`export` declarations
and run the script as a legacy block inside the Sandbox service:

```typescript
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";

function wrapScript(content: string): string {
  return content
    .replace(/^import\s.*?;?\s*$/gm, "")
    .replace(/^export\s+default\s+/m, "const _main = ")
    .replace(/^export\s+const\s+/gm, "const ")
    + "\nawait _main(u);";
}

const raw = await Deno.readTextFile("system/scripts/look.ts");
const result = await sandboxService.runScript(wrapScript(raw), {
  id: "actor1",
  me: { id: "actor1", name: "Bob", flags: new Set(["connected"]), state: {}, contents: [] },
  here: { id: "room1", name: "Lobby", flags: new Set(["room"]), state: {}, contents: [] },
  location: "room1",
  state: {},
  socketId: "sock1",
});
```

### Scripts that emit `u.ui.layout()`

Scripts like `who` and `score` call `u.ui.layout()` which posts a `type: "result"` message
that resolves the sandbox early. Use an extended stub that captures both `_sent` and
`_broadcast` and stubs `u.ui.layout`:

```typescript
const extra = `
  const _sent = [];
  const _broadcast = [];
  u.send = (msg) => { _sent.push(msg); };
  u.emit = (msg) => { _broadcast.push(msg); };
  u.ui = { layout: (data) => { postMessage({ type: "result", data }); } };
`;
```

---

## Testing Commands Registered with addCmd()

For commands registered via `addCmd()`, import the command module directly,
call the `exec` function, and inspect the mock SDK:

```typescript
import { addCmd, cmds } from "../src/services/commands/cmdParser.ts";

Deno.test({ name: "greet command", ...OPTS, fn: async () => {
  // Register the command
  addCmd({
    name: "greet",
    pattern: /^greet\s+(.+)/i,
    exec: async (u) => {
      u.send(`You wave at ${u.cmd.args[0]}.`);
    },
  });

  let output = "";
  const u = {
    me: { id: "p1", name: "Alice", flags: new Set(["connected"]), state: {}, contents: [] },
    cmd: { args: ["Bob"], switches: [], original: "greet Bob" },
    send: (msg: string) => { output += msg; },
    emit: () => {},
  } as any;

  const cmd = cmds.find(c => c.name === "greet")!;
  await cmd.exec(u);

  if (!output.includes("wave at Bob")) throw new Error(output);
}});
```

---

## Testing Plugins

Test a plugin's `init()` and `remove()` in isolation by calling them directly.
Use a shared DB prefix that won't collide with other tests.

```typescript
import myPlugin from "../src/plugins/my-feature/index.ts";
import { DBO } from "../src/services/Database/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const db = new DBO<{ title: string }>("test.my-feature");

Deno.test({ name: "my-feature plugin", ...OPTS, fn: async (t) => {
  await myPlugin.init();

  await t.step("creates a record", async () => {
    await db.create({ title: "hello" });
    const result = await db.queryOne({ title: "hello" });
    if (!result || result.title !== "hello") throw new Error("Record not found");
  });

  // Always clean up
  await myPlugin.remove?.();
  await db.deleteAll({});
}});
```

---

## Database IDs

Prefix DB IDs in tests to avoid collisions between test files that run in parallel:

```typescript
// Good — unique prefix per test file
const actor = { id: "sa_actor1", … };  // "sa_" = scripts_attrs
const room   = { id: "sa_room1",  … };

// Bad — generic IDs collide across test files
const actor = { id: "actor1", … };
```

Close the DB in the last test of the file:

```typescript
import { DBO as _DBO } from "../src/services/Database/index.ts";

// Last test in the file:
Deno.test({ name: "cleanup", ...OPTS, fn: async () => {
  await _DBO.close();
}});
```

---

## Stubbing the Sandbox

Scripts that reference in-game objects (exits, inventory, rooms) need the sandbox
stubs set up with inline JavaScript object literals — **not `JSON.stringify`**, which
breaks `Set`:

```typescript
const jsExit = `{ id: "x1", name: "North", flags: new Set(["exit"]), state: {}, contents: [] }`;

// Counter must be defined INSIDE the extra string so it's scoped to the worker:
const extra = `
  let _callCount = 0;
  u.db = {
    ...u.db,
    search: async () => ++_callCount === 1 ? [${jsExit}] : [],
  };
`;
```

---

## Coverage

```bash
deno task test:coverage
```

This runs the full suite, then outputs:
1. An LCOV file at `coverage/lcov.info` — compatible with most CI coverage dashboards
2. A summary table in the terminal

To view HTML coverage (requires `genhtml` from `lcov`):

```bash
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html
```

---

## CI

The project uses GitHub Actions. The workflow is at `.github/workflows/ci.yml`.
Tests run on every push and pull request:

```yaml
- name: Run tests
  run: deno test --allow-all --unstable-kv --no-check
```

Tests must pass before a PR can be merged.

---

## Pre-Commit Gauntlet

These four steps mirror CI and must pass before every commit:

```bash
deno check --unstable-kv mod.ts
deno lint
deno test tests/ --allow-all --unstable-kv --no-check
deno test tests/security_*.test.ts --allow-all --unstable-kv --no-check
```

The full suite is green on `main` — there are no expected failures. If a test
fails on your branch, fix it before submitting a PR.
