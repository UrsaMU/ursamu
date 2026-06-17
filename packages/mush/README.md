# @ursamu/mush

Full MUSH world layer built on `@ursamu/core`. Re-exports everything from
core, then adds: the `IDBObj` world model (players, rooms, exits, things),
flag and lock systems, a TinyMUX 2.x softcode evaluator with Web Worker
sandbox, the `addCmd`/`IUrsamuSDK` command API, a format pipeline
(CONFORMAT, NAMEFORMAT, etc.), and essential MUSH verbs (look, say, pose,
get/drop/give, home, who, page). Game code imports from `@ursamu/mush`
only — no separate core import needed.

> `@ursamu/ursamu` is a backwards-compatibility shim that re-exports this
> package. New projects should import directly from `@ursamu/mush`.

## Install

```typescript
// Deno / JSR
import { addCmd, dbojs, gameHooks } from "jsr:@ursamu/mush";
import type { ICmd, IUrsamuSDK, IDBObj } from "jsr:@ursamu/mush";
```

## Quick start

```typescript
import { addCmd } from "jsr:@ursamu/mush";
import type { IUrsamuSDK } from "jsr:@ursamu/mush";

addCmd({
  name: "+greet",
  pattern: /^\+greet\s*(.*)/i,
  lock: "connected",
  category: "Social",
  help: `+greet <name>  — Send a greeting to someone nearby.

Examples:
  +greet Alice    Greets Alice.
  +greet          Greets the room.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const target = name ? await u.util.target(u.me, name) : null;
    if (name && !target) { u.send("I don't see them here."); return; }
    const to = target ? u.util.displayName(target, u.me) : "everyone";
    u.send(`%chYou wave hello to ${to}.%cn`);
  },
});
```

## Key exports

| Export | Purpose |
|---|---|
| `addCmd` | Register a MUSH command with lock + SDK context |
| `dbojs` | Primary world-object `DBO<IDBObj>` collection |
| `flags` | Flag definitions and tag system |
| `evaluateLock` / `validateLock` | Lock evaluation engine |
| `registerLockFunc` | Register a custom lock callable |
| `gameClock` | In-game time tracking |
| `softcodeEngine` / `runSoftcode` | TinyMUX 2.x evaluator |
| `sandboxService` / `SandboxService` | Web Worker sandbox for scripts |
| `registerFormatHandler` | Register a display-format handler |
| `registerFormatTemplate` | Register a MUSH softcode format template |
| `resolveFormat` / `resolveGlobalFormat` | Render a format slot |
| `createNativeSDK` | Build an `IUrsamuSDK` from a session + actor |
| `loadDefaultCommands` | Load built-in MUSH verb set |
| `registerScript` | Register or override a softcode script by name |
| `gameHooks` + all core exports | Everything from `@ursamu/core` |

## Lock levels

| Lock string | Allowed |
|---|---|
| `""` | Login screen (unauthenticated) |
| `"connected"` | Any logged-in player |
| `"connected builder+"` | Builder flag or higher |
| `"connected admin+"` | Admin flag or higher |
| `"connected wizard"` | Wizard only |

Locks also support callables: `flag(name)`, `attr(name[,val])`, `type(name)`,
`is(#id)`, `holds(#id)`, `perm(level)`. Combine with `&&`, `||`, `!`.
Locks are fail-closed.

## Game project usage

Most game projects and plugins should import exclusively from `@ursamu/mush`.
You get the full transport + database + event infrastructure from core plus
every MUSH primitive in a single import.

```typescript
// Everything you need for a game plugin
import { addCmd, dbojs, gameHooks, DBO, registerRoute } from "jsr:@ursamu/mush";
import type { ICmd, IUrsamuSDK, IDBObj, IPlugin } from "jsr:@ursamu/mush";
```

For the transport-only layer without MUSH concepts, see
[`@ursamu/core`](../core/README.md).
