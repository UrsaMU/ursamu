# wod20th -- UrsaMU Plugin

## Setup (do this first)

```bash
npx @lhi/ursamu-dev         # install the dev skill
ursamu-dev --install-hooks  # block commits that fail the audit
```

Activate in Claude Code: `/ursamu-dev`

The skill enforces a six-stage pipeline (Design -> Generate -> Audit -> Refine -> Test -> Docs)
and knows every import path, SDK method, lock level, and security pattern.
Use it for every feature -- no exceptions.

---

## Commands

```bash
deno task test                       # full suite -- must stay green
deno lint                            # must be clean
deno task showcase --list            # list this plugin's showcases
deno task showcase wod20th-basic     # render the basic showcase
ursamu-audit --fix                   # auto-fix common violations
ursamu-audit --watch                 # live violation feedback on save
```

---

## Structure

```
src/plugins/wod20th/
+-- index.ts               IPlugin -- init(), remove(), registerHelpDir, imports commands.ts
+-- commands.ts            Barrel only -- one import per family, NO logic
+-- commands/
|   +-- wod20th.ts         addCmd() registrations live here, not in commands.ts
+-- router.ts              REST handler for /api/v1/wod20th
+-- db/
|   +-- schemas.ts         Types only -- DBO instances live in the command files that own them
+-- help/
|   +-- wod20th.md         In-game help text (served by help-plugin FileProvider)
+-- tests/
|   +-- plugin.test.ts     Deno unit tests
+-- showcases/wod20th.json demo steps  ->  deno task showcase wod20th-basic
```

---

## Import paths

```typescript
import { addCmd }              from "ursamu/commands";
import { DBO }                 from "ursamu/database";
import { gameHooks }           from "ursamu";
import { registerPluginRoute } from "ursamu/app";
import type { IPlugin, IUrsamuSDK, IDBObj, SessionEvent } from "ursamu/types";
```

---

## Command shape: slash-keys, single equals

When a command has **multiple identifying keys** (the things being addressed),
separate them with `/`. Use `=` **only** for the assigned value, and only once.
Omit `=` entirely when there's no value.

```
GOOD  +sept/position Sept of the Pines/Cassidy=Master of the Rite
GOOD  +sept/unposition Sept of the Pines/Cassidy
GOOD  +sept/bind Sept of the Pines/Heart-of-the-Glen
GOOD  +pack/totem Iron Riders/Wolf=5

BAD   +sept/position Sept of the Pines=Cassidy=Master of the Rite
BAD   +pack/totem Iron Riders=Wolf=5
```

Single-key commands keep `=` for the value:

```
+sept/leader Sept of the Pines=Storms
+pack/create Iron Riders
+caern/setroom Heart-of-the-Glen=room-1234
```

Filters and modifiers on read commands ride in the `=value` slot as a
comma-separated `key:val,key:val` list. Sept is still the only key on the
LHS; sort and filter live on the right:

```
+sept/roster Sept of the Pines=sort:rank,auspice:galliard,pack:iron riders
```

---

## addCmd skeleton

```typescript
addCmd({
  name: "+wod20th",
  pattern: /^\+wod20th(?:\/(\S+))?\s*(.*)/i,  // args[0]=switch, args[1]=rest
  lock: "connected",
  category: "General",
  help: `+wod20th[/switch] <arg>  -- Description.

Examples:
  +wod20th foo    Does the thing.
  +wod20th bar    Does the other thing.`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();  // strip codes FIRST
  },
});
```

---

## Plugin lifecycle (index.ts)

```typescript
import "./commands.ts";  // Phase 1 -- addCmd() fires here, NOT in init()

const onLogin = (e: SessionEvent) => { /* named ref -- required for remove() */ };

export const plugin: IPlugin = {
  name: "wod20th",
  version: "1.0.0",
  description: "One sentence.",
  init:   () => { gameHooks.on("player:login", onLogin); return true; },
  remove: () => { gameHooks.off("player:login", onLogin); },  // same ref
};
```

Rules: `addCmd()` never inside `init()` · `init()` must return `true` · every `.on()` needs a matching `.off()` using the same named function.

---

## Key SDK calls

```typescript
const target = await u.util.target(u.me, arg, true);  // true = global search
if (!target) { u.send("Not found."); return; }

if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

await u.db.modify(target.id, "$set",  { "data.field": value });
await u.db.modify(target.id, "$inc",  { "data.score": 1 });
await u.db.modify(target.id, "$unset",{ "data.tmp": "" });

u.send("Message.", target.id);  // optional second arg = recipient socket id
```

---

## Player-inline state pattern

```typescript
// Reading (always default)
const ps = (u.me.state.wod20th ?? {}) as IWod20thPlayerState;

// Writing (always spread to preserve other fields)
await u.db.modify(u.me.id, "$set", { "state.wod20th": { ...ps, field: value } });
```

Use `state.wod20th` for per-player condition (chargen stage, HP, active status).
Use `new DBO("wod20th.collection")` for records with their own lifecycle (markets, jobs, combat rounds).

---

## Help file standards

Help files live in `help/wod20th.md` (and additional files as needed). They are served in-game by the help-plugin FileProvider.

### Width and length

- **Maximum line width: 78 characters.** Every line of help text must fit within 78 printable characters.
- **Maximum page length: 22 lines of content** (one terminal screen). Count blank lines. Split topics that exceed this.

### Splitting long topics

```
help/
+-- wod20th.md           <- index / overview (<=22 lines)
+-- wod20th-chargen.md   <- chargen commands
+-- wod20th-rolling.md   <- dice and rolling
+-- wod20th-stats.md     <- stat commands
```

The index file must end with:

```
SEE ALSO: +help wod20th-chargen, +help wod20th-rolling, +help wod20th-stats
```

Each sub-file opens with:

```
See also: +help wod20th (overview)
```

### File format

```
TOPIC TITLE

One-sentence description.

SYNTAX
  +command[/switch] <required> [<optional>]

SWITCHES
  /switch    What this switch does.

EXAMPLES
  +command foo       Does the thing.
  +command/switch x  Does the other thing.

SEE ALSO: +help related-topic
```

- No decorative header or footer lines -- the help renderer handles presentation.
- Section labels (`SYNTAX`, `SWITCHES`, `EXAMPLES`, `SEE ALSO`) ALL CAPS, flush left.
- Body text indented 2 spaces.
- Exactly 1 blank line between sections.
- No line exceeds 78 characters.
