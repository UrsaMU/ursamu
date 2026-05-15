---
layout: layout.vto
description: Extension points exposed by the UrsaMU engine
---

# Extending UrsaMU

UrsaMU exposes a small set of named registries through `jsr:@ursamu/ursamu`
(`mod.ts`). Each one is a stable extension point intended for plugins and
child-game code. Plugins are still the preferred packaging unit — these
registries are what plugins use under the hood.

All examples assume the JSR import path used by external plugins:

```typescript
import { /* ... */ } from "jsr:@ursamu/ursamu";
```

## Commands

`addCmd({ name, pattern, lock, category, help, exec })` registers a command.
The `exec` handler receives an `IUrsamuSDK` (`u`) with `u.me`, `u.here`,
`u.cmd`, `u.send`, `u.db`, `u.util`, `u.canEdit`, and the other SDK
namespaces listed in `docs/api/sdk.md`. See `CLAUDE.md` for the `addCmd`
skeleton and pattern cheat-sheet (catch-all switch gotcha included).

## Format handlers

Format handlers customize how named display slots (NAMEFORMAT, DESCFORMAT,
CONFORMAT, EXITFORMAT, WHOFORMAT, WHOROWFORMAT, PSFORMAT, PSROWFORMAT, or any
arbitrary uppercase slot name) render. Two entry points:

- `registerFormatHandler(slot, fn)` — TS function that returns a string.
- `registerFormatTemplate(slot, mushSource)` — raw MUSH softcode body, parsed
  and evaluated as if it were a `&NAMEFORMAT` attribute (v2.4.0).

Lookups go through `resolveFormat` / `resolveFormatOr` (per-target) and
`resolveGlobalFormat` / `resolveGlobalFormatOr` (two-tier `#0` → `u.me`).
`unregisterFormatHandler(slot)` removes a registration. All four resolvers
are reachable from softcode via `u.util`. See `docs/api/core.md` for the
full slot list and priority rules.

## Lock functions

`registerLockFunc(name, fn)` adds a callable lock primitive usable inside
lock strings (`tribe(glasswaler)`, `attr(mortal) || !tribe(glasswaler)`,
`connected && perm(builder)`). Built-in names — `flag`, `attr`, `type`,
`is`, `holds`, `perm` — are protected and cannot be overwritten. Locks are
fail-closed: unknown function or thrown error evaluates to `false`. Max
length 4096 chars / 256 tokens. Lock strings support `&&`, `||`, `!`, and
`()` grouping; legacy `&` / `|` still parse.

## Softcode functions and substitutions

- `registerSoftcodeFunc(name, fn)` adds a stdlib function callable from any
  evaluated attribute (e.g. `magic(x, y)`).
- `registerSoftcodeSub(name, fn)` adds a `%`-substitution handler (e.g.
  `%mxp[...]`).

Both feed the same `softcodeService` evaluator used by `u.eval` /
`u.evalString` and by `&attr`/`@trigger` dispatch.

## Command middleware

`registerCmdMiddleware(fn)` inserts a middleware function into the command
pipeline before `exec` runs. Use it for logging, audit, rate-limiting, or
short-circuit interception. Middleware receives the same context the
dispatcher builds and can call `next()` to continue or return early to
abort.

## Scripts

`registerScript(name, content)` registers a sandbox script (legacy block or
ESM `export default async (u) => { ... }`). Resolution order at dispatch
time: local `system/scripts/<name>.ts` override → plugin registry → engine
bundled. Use this when a plugin wants to ship a sandboxed script without
writing to disk.

## REST routes

`registerPluginRoute(method, path, handler)` attaches an Express handler to
the main HTTP app. The handler receives the standard Express
`(req, res, next)` triple. Return 401 before any work when `req.userId` is
null. Routes are namespaced by convention under `/api/v1/<plugin>/...`.

## UI components

`registerUIComponent(component)` adds an entry to `GET /api/v1/ui-manifest`
so the bundled web client (and any other client that reads the manifest)
can discover plugin-provided UI. `unregisterUIComponent(id)` removes it;
`getRegisteredUIComponents()` lists current entries.

## Stat systems

`registerStatSystem(system)` registers an `IStatSystem` implementation
(stats, skills, validation, sheet rendering) that chargen plugins and game
projects can target. `getStatSystem(name)`, `getDefaultStatSystem()`, and
`getStatSystemNames()` are the read-side helpers.

## Game hooks

`gameHooks` is the engine's `EventEmitter`. Subscribe with
`gameHooks.on(event, listener)` and pair every listener with a matching
`gameHooks.off(event, listener)` in `remove()` — using the same named
reference is non-negotiable (see `CLAUDE.md`). Typed events
(`GameHookMap`):

- `player:login`, `player:logout`
- `say`, `pose`, `page`, `move`
- `channel:message`
- `object:created`, `object:destroyed`, `object:modified`
- `scene:created`, `scene:pose`, `scene:set`, `scene:title`, `scene:clear`
- `mail:received`

## Plugin skeleton

```typescript
import "./commands.ts"; // Phase 1: addCmd at module load
import {
  gameHooks,
  registerFormatTemplate,
  registerLockFunc,
} from "jsr:@ursamu/ursamu";
import type { IPlugin, SessionEvent } from "jsr:@ursamu/ursamu";

const onLogin = (e: SessionEvent) => { /* ... */ };

export const plugin: IPlugin = {
  name: "myplugin",
  version: "1.0.0",
  description: "One sentence.",
  init: () => {
    gameHooks.on("player:login", onLogin);
    registerLockFunc("tribe", (en, _t, args) =>
      String(en.state.tribe ?? "").toLowerCase() === args[0]?.toLowerCase()
    );
    registerFormatTemplate("NAMEFORMAT", "[name(%0)] <<%1>>");
    return true;
  },
  remove: () => {
    gameHooks.off("player:login", onLogin);
  },
};
```

See `docs/api/core.md` for full signatures and `docs/api/sdk.md` for the
`IUrsamuSDK` surface.
