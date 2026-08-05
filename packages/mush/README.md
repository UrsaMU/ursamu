# @ursamu/mush

**Version 1.0.1** (stable). Built on **`@ursamu/core@^1.0.0`**.

Full MUSH world layer on core: `IDBObj` world model (players, rooms,
exits, things), flags and locks, TinyMUX-oriented softcode + Worker
sandbox, `addCmd` / `IUrsamuSDK`, format pipeline (NAMEFORMAT, …), and
core verbs (look, say, pose, get/drop/give, home, who, page, ooc,
+finger, +staff, +glance, +gname, +motd, +uptime, +summon, …).

Import from `@ursamu/mush` only for game plugins (core is re-exported).

> `@ursamu/ursamu` is a compatibility shim that re-exports this package.
> New projects should import `@ursamu/mush`.

See `CHANGELOG.md`, `docs/STABLE.md`, `docs/DUAL_PACKAGE.md`,
`docs/SOFTCODE.md`.

## Stable API (1.0)

Breaking changes to stable exports require **2.0.0**. Full table:
`docs/STABLE.md`.

**Stable** — `addCmd`, `IUrsamuSDK`, `dbojs`, locks/flags,
permissions, `gameHooks`, format resolve, layout chrome,
`runSoftcode` / stdlib register, `mu` / `initializeEngine`,
cmd middleware lifecycle.

**Evolving** — `@restart` pin lists, some admin/REST internals,
compat stubs (`wsService`).

**Not in mush** — full building (builder), channels, mail/bbs/jobs.

**Hosts must force a single mush instance** via import-map overrides
when plugins pin different ranges. See `docs/DUAL_PACKAGE.md`.

## Install

```typescript
// Deno / JSR
import { addCmd, dbojs, gameHooks } from "jsr:@ursamu/mush@^1.0.0";
import type { ICmd, IUrsamuSDK, IDBObj } from "jsr:@ursamu/mush@^1.0.0";
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
| `header` / `divider` / `footer` | Layout chrome helpers |
| `registerHeader` / `Divider` / `Footer` | Plugin layout stacks |
| `setLayoutTemplates` / `hasLayoutTemplate` | Config-driven layout mushcode |
| `applyLayoutFromConfig` | Load `game.layout.*` from config |
| `createNativeSDK` | Build an `IUrsamuSDK` from a session + actor |
| `loadDefaultCommands` | Load built-in MUSH verb set |
| `registerScript` | Register or override a softcode script by name |
| `gameHooks` + all core exports | Everything from `@ursamu/core` |

## Layout chrome (`game.layout`)

Theme headers, dividers, and footers with TinyMUX-style templates in
`config/config.json`. Loaded at engine start via `applyLayoutFromConfig`.

```json
{
  "game": {
    "layout": {
      "header":  "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
      "divider": "[center(%ch%cy%0%cn,%1,%cg-%cn)]",
      "footer":  "[repeat(%cg=%cn,%1)]"
    }
  }
}
```

| Placeholder | Meaning |
|-------------|---------|
| `%0` | Title / label |
| `%1` | Width (default `78`) |
| `%2` | Filler |
| `%b` | Space (use around `%0` for padding) |

Title padding is intentional — e.g. `%b%0%b` or ` %0 ` keeps a
gap between the label and the fill characters. Layout arg splitting
does **not** trim those spaces.

Supported functions (nested ok): `center`, `ljust`, `rjust`,
`repeat`, `space`, `cat`, `lit`, `strlen`, `words`, `if`, `eq`,
`neq`, `and`, `or`, `not`, `gt`/`lt`/`gte`/`lte`, `add`/`sub`/
`mul`/`div`, `min`/`max`/`abs`, `first`/`rest`, `mid`/`left`/
`right`, `strip`/`trim`. Color codes and `%r` / `%t` / `%b`
pass through.

Conditional divider example (title line or nothing):

```json
"divider": "[if(words(%0),center(%ch%cy%0%cn,%1,%cg-%cn),)]"
```

Config templates apply to:

- native `header()` / `divider()` / `footer()`
- sandbox `u.util.header` / `divider` / `footer`
- softcode `[header()]` / `[divider()]` / `[footer()]` when a template
  is set for that slot

Plugin `registerHeader` / etc. still work when no config template is set
for that slot. A config template takes priority for its slot.

```typescript
import {
  header,
  setLayoutTemplates,
  hasLayoutTemplate,
} from "jsr:@ursamu/mush";

setLayoutTemplates({
  header: "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
});
header("Character Sheet"); // uses template when set
```

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
import {
  addCmd, dbojs, gameHooks, DBO, registerRoute,
} from "jsr:@ursamu/mush";
import type {
  ICmd, IUrsamuSDK, IDBObj, IPlugin,
} from "jsr:@ursamu/mush";
```

For the transport-only layer without MUSH concepts, see
[`@ursamu/core`](https://jsr.io/@ursamu/core) (stable **1.0.0**).

## Version policy

| Change | Bump |
|--------|------|
| Remove/rename stable export or change documented return semantics | major |
| New softcode stdlib function, new format slot, additive SDK field | minor |
| Bugfix, docs, tests | patch |

Softcode is TinyMUX-**oriented**, not a full certified clone. See
`docs/SOFTCODE.md`.

## Develop

```bash
deno task test
deno task check
deno task preflight
```
