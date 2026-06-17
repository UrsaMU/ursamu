# @ursamu/mush — Claude Code Instructions

## What this package is

`@ursamu/mush` = `@ursamu/core` + MUSH world model + softcode engine + `addCmd` API + essential MUSH verbs.
Re-exports everything from `@ursamu/core` — game code only needs one import.

## Dependency direction

**mush → core. core NEVER → mush.**
Need something from core inside mush? Import from `"@ursamu/core"`. Tempted to make core import mush? You're solving the wrong problem.

---

## Key types

```typescript
// World model
interface IDBObj {
  id: string; name: string; flags: Set<string>;
  state: Record<string, unknown>; location?: string; contents: IDBObj[];
}

// Command registration
interface ICmd {
  name:     string;
  pattern:  RegExp;
  lock:     string;    // "connected", "connected admin+", etc.
  category: string;
  help:     string;    // syntax line + ≥2 examples (required)
  exec:     (u: IUrsamuSDK) => void | Promise<void>;
}

// Command context — the "u" object
interface IUrsamuSDK {
  me:   IDBObj;        // acting player
  here: IDBObj;        // current room
  cmd:  { name: string; original: string; args: string[]; switches: string[] };
  send: (msg: string, target?: string) => void;
  eval: (objId: string, attr: string) => Promise<string>;
  attr: { get(id: string, name: string): Promise<string|null>; set(id: string, name: string, val: string): Promise<void> };
  db:   DbAccessor;    // modify/search/create/destroy
  util: { target(actor, name, global?): Promise<IDBObj|null>; displayName(obj, viewer): string; stripSubs(s: string): string; parseDesc(s: string): string };
  canEdit: (actor: IDBObj, target: IDBObj) => Promise<boolean>;
}
```

---

## How `addCmd` relates to `addHandler`

`addCmd` (mush) wraps `addHandler` (core):

1. Registers pattern with core's dispatch pipeline
2. On match: resolves session → `IDBObj` actor via `dbojs`
3. Evaluates MUSH lock (`evaluateLock`)
4. Builds `IUrsamuSDK` (`createNativeSDK`)
5. Calls `cmd.exec(u)`

`addHandler` in core sees none of this — it just fires `exec(ICoreContext)`.

---

## Lock levels

| String | Who |
|---|---|
| `""` | Login screen (unauthenticated) |
| `"connected"` | Any logged-in player |
| `"connected builder+"` | Builder flag or higher |
| `"connected admin+"` | Admin flag or higher |
| `"connected wizard"` | Wizard only |

Lock strings support callables: `flag(name)`, `attr(name[,val])`, `type(name)`, `is(#id)`, `holds(#id)`, `perm(level)`.
Combine with `&&`, `||`, `!`, `()`. Locks are fail-closed: unknown func → false.

---

## Softcode / Sandbox

Scripts in `src/softcode/` run in Web Workers. Runtime imports are regex-stripped at load time — all SDK access comes through the injected `u` object. Type-only imports survive (elided at compile).

The softcode evaluator is `@ursamu/mushcode`. The sandbox wraps it in a Worker with a message protocol. **Never import from mushcode directly in command code — use `u.eval()` instead.**

Worker rules: no `Deno.*`, no `fetch`, no `import` (except ESM `export default`). ESM style preferred:

```typescript
export default async (u: IUrsamuSDK) => { /* ... */ };
```

---

## Directory map

```
packages/mush/
├── mod.ts                     public API (re-exports core + mush)
├── deno.json
├── src/
│   ├── world/
│   │   ├── types.ts           IDBObj, IAttribute
│   │   ├── flags.ts           Tags instance + flag definitions
│   │   ├── locks.ts           evaluateLock, validateLock
│   │   └── dbobjs.ts          dbojs collection + Obj class
│   ├── softcode/
│   │   ├── engine.ts          EvalEngine singleton + runSoftcode
│   │   ├── sandbox.ts         SandboxService (Web Worker)
│   │   └── stdlib/            stdlib modules (math, string, list, etc.)
│   ├── commands/
│   │   ├── types.ts           ICmd, IUrsamuSDK, DbAccessor
│   │   ├── addCmd.ts          addCmd() wrapping core's addHandler
│   │   ├── sdk.ts             createNativeSDK()
│   │   └── pipeline-stages.ts dispatch stages (interceptors, patterns, exits)
│   ├── verbs/
│   │   ├── look.ts            look/l
│   │   ├── say.ts             say, pose, think
│   │   ├── manipulation.ts    get, drop, give, use
│   │   ├── home.ts            home, inventory
│   │   └── social.ts          who, page, whisper
│   ├── format/
│   │   └── handlers.ts        CONFORMAT, NAMEFORMAT, registerFormatHandler
│   └── events/
│       └── types.ts           MushHookMap (augments CoreHookMap)
└── tests/
```

---

## Import paths

```typescript
// Inside mush package — import core via alias
import { addHandler, DBO, gameHooks } from "@ursamu/core";

// In game plugins (outside the repo) — import from mush; gets everything
import { addCmd, dbojs, evaluateLock, gameHooks } from "@ursamu/mush";
import type { ICmd, IUrsamuSDK, IDBObj } from "@ursamu/mush";
```

---

## `addCmd` skeleton

```typescript
addCmd({
  name: "+example",
  pattern: /^\+example(?:\/(\S+))?\s*(.*)/i,  // args[0]=switch, args[1]=rest
  lock: "connected",
  category: "General",
  help: `+example[/<sw>] <arg>  — Description.

Examples:
  +example foo
  +example/switch bar`,
  exec: async (u) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    // guard null targets, check canEdit, then db.modify
  },
});
```

### Pattern cheat-sheet

| Intent | Pattern | args |
|---|---|---|
| No args | `/^inventory$/i` | — |
| One arg | `/^look\s+(.*)/i` | `[0]` |
| Switch + arg | `/^\+cmd(?:\/(\S+))?\s*(.*)/i` | `[0]`=sw, `[1]`=rest |
| Two parts | `/^@name\s+(.+)=(.+)/i` | `[0]`, `[1]` |

### Catch-all switch gotcha

A catch-all pattern like `/^\+cmd(?:\/(\S+))?\s*(.*)/i` consumes all `+cmd/anything` input. A separate `addCmd` for `+cmd/sub` will never be reached. Put sub-commands as switch branches inside the single `exec`.

---

## MUSH color codes

| Code | Effect | Code | Effect |
|---|---|---|---|
| `%ch` | Bold | `%cn` | Reset (always close) |
| `%cr` | Red | `%cg` | Green |
| `%cb` | Blue | `%cy` | Yellow |
| `%cw` | White | `%cc` | Cyan |
| `%r` | Newline | `%t` | Tab |

Always close color with `%cn`. Use `u.util.center(title, 78, "=")` for headers.

---

## DB access

```typescript
// Writes — op must be "$set" | "$inc" | "$unset" only
await u.db.modify(target.id, "$set",   { "data.gold": 100 });
await u.db.modify(target.id, "$inc",   { "data.score": 1 });
await u.db.modify(target.id, "$unset", { "data.tempFlag": "" });

// Never raw object overwrite. Never dot-notation keys with Object.assign-based DBs.
```

---

## Pre-commit checklist

```bash
deno check mod.ts --unstable-kv
deno lint
deno test tests/ --allow-all --unstable-kv --no-check
```

---

## Code style (non-negotiable)

- No file > 200 lines. No function > 50 lines.
- `catch (e: unknown)` always — no bare catch.
- Named exports only.
- Early return over nesting (max 3 levels).
- `stripSubs()` on all user input before DB ops or length checks.
- `canEdit()` before modifying any object not owned by `u.me`.
- DB writes: `"$set"` / `"$inc"` / `"$unset"` — never raw overwrite.
- `u.util.target()` result null-checked before use.
- All `%c*` color codes closed with `%cn`.
- Every `addCmd` has `help:` with syntax line + ≥2 examples.

---

## Audit checklist

- [ ] `stripSubs()` on all user strings before DB ops or length checks
- [ ] `canEdit()` before modifying objects not owned by `u.me`
- [ ] DB writes use `"$set"` / `"$inc"` / `"$unset"` only
- [ ] `target()` result null-checked before use
- [ ] Admin-only actions check `u.me.flags` explicitly
- [ ] Softcode scripts use no Deno APIs, no `fetch`, no direct mushcode imports
- [ ] All `%c*` color codes closed with `%cn`
- [ ] Every `addCmd` has `help:` with syntax line + ≥2 examples
