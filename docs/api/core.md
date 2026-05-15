---
layout: layout.vto
title: Core API Reference
description: Complete type and function reference for UrsaMU plugin and script authors — exports of jsr:@ursamu/ursamu as of v2.6.0.
---

# Core API Reference

Everything documented here is exported from `jsr:@ursamu/ursamu`. Last
verified against `mod.ts` for v2.6.0.

## Contents

- [Imports](#imports)
- [Engine entry points](#engine-entry-points) — `mu`, `startTelnetServer`, `createObj`, `checkAndCreateSuperuser`
- [Commands](#commands) — `addCmd`, `cmds`, `registerScript`, `registerCmdMiddleware`
- [Plugin SDK (IUrsamuSDK)](#plugin-sdk-iursamusdk) — the `u` object
- [Database](#database) — `DBO`, `dbojs`
- [Locks & permissions](#locks--permissions) — `registerLockFunc`, `evaluateLock`, `validateLock`
- [Format handlers](#format-handlers) — `registerFormatHandler`, `registerFormatTemplate`, `resolveFormat`, `resolveGlobalFormat`, `header`/`divider`/`footer`
- [Softcode extension](#softcode-extension) — `registerSoftcodeFunc`, `registerSoftcodeSub`, `softcodeService`
- [Hooks & events](#hooks--events) — `gameHooks`, `GameHookMap`
- [REST & UI](#rest--ui) — `registerPluginRoute`, `registerUIComponent`
- [Stat systems](#stat-systems) — `registerStatSystem`
- [WebSocket](#websocket) — `wsService`, `joinSocketToRoom`, `send`
- [Engine context](#engine-context) — `buildContext`, `GameContext`
- [Plugin config](#plugin-config) — `PluginConfigManager`
- [Stdlib (TS)](#stdlib-ts) — Noise, Rng, physics, spatial, interpolation, vectors
- [Types](#types)
- [Internal: plugin install errors](#internal-plugin-install-errors)

---

## Imports

```typescript
import {
  mu, startTelnetServer, createObj, checkAndCreateSuperuser,
  addCmd, cmds, registerScript, registerCmdMiddleware,
  DBO, dbojs, send, joinSocketToRoom, wsService,
  gameHooks,
  registerLockFunc, evaluateLock, validateLock,
  registerFormatHandler, registerFormatTemplate, unregisterFormatHandler,
  resolveFormat, resolveFormatOr, resolveGlobalFormat, resolveGlobalFormatOr,
  header, divider, footer,
  registerSoftcodeFunc, registerSoftcodeSub, softcodeService,
  registerPluginRoute, registerUIComponent, unregisterUIComponent, getRegisteredUIComponents,
  registerStatSystem, getStatSystem, getDefaultStatSystem, getStatSystemNames,
  buildContext, PluginConfigManager,
} from "jsr:@ursamu/ursamu";

import type {
  IUrsamuSDK, IDBObj, IDBOBJ, ICmd, IPlugin, IPluginDependency,
  IContext, IMiddlewareFunction, IStatSystem, IUIComponent,
  GameHookMap, SessionEvent, SayEvent, PoseEvent, PageEvent, MoveEvent,
  ChannelMessageEvent, ObjectCreatedEvent, ObjectDestroyedEvent, ObjectModifiedEvent,
  SceneCreatedEvent, ScenePoseEvent, SceneSetEvent, SceneTitleEvent, SceneClearEvent,
  MailReceivedEvent, FormatHandler, FormatSlot, GameContext, UserSocket,
  LockFunc, SoftcodeFn, SoftcodeSubHandler, SoftcodeContext,
} from "jsr:@ursamu/ursamu";
```

---

## Engine entry points

### `mu(config?)`

Boots the engine. Call once from `src/main.ts`.

```typescript
import { mu } from "jsr:@ursamu/ursamu";
await mu();
```

### `startTelnetServer(port?)`

Spawn a standalone Telnet listener that talks to the same hub.

### `createObj(template)`

Create a DB object outside of a command handler (migrations, seeders).

```typescript
const room = await createObj({
  name: "The Void",
  flags: new Set(["room"]),
  state: { desc: "An empty room." },
  contents: [],
});
```

### `checkAndCreateSuperuser()`

Idempotent — ensures `#1` exists with the `superuser` flag.

---

## Commands

### `addCmd(...cmds)`

Registers one or more `ICmd` objects. Safe at module load.

```typescript
addCmd({
  name: "+greet",
  pattern: /^\+greet\s+(.+)/i,
  lock: "connected",
  category: "Social",
  help: "+greet <name> — Say hello.",
  exec: (u) => u.send(`Hello, ${u.cmd.args[0]}!`),
});
```

`ICmd` shape:

```typescript
interface ICmd {
  name: string;
  pattern: string | RegExp;
  lock?: string;
  category?: string;
  help?: string;
  hidden?: boolean;
  exec: (u: IUrsamuSDK) => void | Promise<void>;
}
```

Capture groups in `pattern` populate `u.cmd.args[0]`, `[1]`, etc.

### `cmds`

The registered command map. Use to introspect or override an existing
command:

```typescript
import { cmds } from "jsr:@ursamu/ursamu";
const existing = cmds.get("look");
```

### `registerScript(name, content)`

Register a softcode/system script. Lookup order: local file override →
plugin registry → engine bundled.

```typescript
registerScript("custom-look", "say You ran the custom look script.");
```

### `registerCmdMiddleware(fn)`

Insert middleware into the command pipeline. Runs before `exec`. Return
`false` to abort dispatch.

```typescript
registerCmdMiddleware(async (u) => {
  if (u.me.flags.has("frozen")) { u.send("You're frozen."); return false; }
});
```

---

## Plugin SDK (`IUrsamuSDK`)

The `u` object passed to every `addCmd` `exec` and every sandbox script.

```typescript
interface IUrsamuSDK {
  state: Record<string, unknown>;
  socketId?: string;
  me: IDBObj;
  here: IDBObj & { broadcast(msg: string): void };
  target?: IDBObj & { broadcast(msg: string): void };
  cmd: { name: string; original?: string; args: string[]; switches?: string[] };

  send(message: string, target?: string): void;
  broadcast(message: string): void;
  execute(command: string): Promise<void>;
  force(command: string): Promise<void>;
  forceAs(targetId: string, command: string): Promise<void>;
  canEdit(actor: IDBObj, target: IDBObj): Promise<boolean>;
  checkLock(target: IDBObj, lock: string): Promise<boolean>;
  setFlags(targetId: string, flags: string): Promise<void>;
  trigger(targetId: string, attr: string, args?: string[]): Promise<void>;
  eval(targetId: string, attr: string, args?: string[]): Promise<string>;
  evalString(source: string): Promise<string>;
  intercept?: (input: string) => Promise<boolean>;

  db:    { search, create, modify, destroy };
  util:  { target, displayName, stripSubs, center, ljust, rjust, sprintf,
           template, parseDesc, resolveFormat, resolveFormatOr,
           resolveGlobalFormat, resolveGlobalFormatOr };
  auth:  { verify, login, hash, setPassword };
  sys:   { setConfig, disconnect, reboot, shutdown, uptime, update,
           gameTime, setGameTime };
  chan:  { join, leave, list, create, destroy, set, history };
  attr:  { get, set, clear };
  events:{ emit, on };
  ui:    { panel, render, layout };
}
```

### `u.db`

All async. `op` must be `"$set"`, `"$inc"`, `"$unset"`, or `"$push"`.

```typescript
const list = await u.db.search({ flags: ["room"] });
const sword = await u.db.create({ name: "Sword", flags: new Set(["thing"]),
  location: u.me.id, state: {}, contents: [] });
await u.db.modify(u.me.id, "$set", { "data.gold": 100 });
await u.db.modify(u.me.id, "$inc", { "data.deaths": 1 });
await u.db.modify(u.me.id, "$unset", { "data.tempFlag": "" });
await u.db.modify(u.here.id, "$push", { "data.log": "Alice arrived." });
await u.db.destroy(sword.id);
```

### `u.util`

```typescript
const obj = await u.util.target(u.me, u.cmd.args[0], true);
const name = u.util.displayName(target, u.me);
const plain = u.util.stripSubs("%chBold%cn");
u.send(u.util.center("TITLE", 78, "="));
u.send(u.util.ljust("Name", 20) + u.util.rjust("100", 10));
u.send(u.util.sprintf("%-20s %5d gp", player.name!, gold));
const text = await u.util.resolveFormat(u.me, "NAMEFORMAT", defaultName);
```

### `u.auth` / `u.sys` / `u.chan` / `u.attr` / `u.events`

```typescript
await u.auth.verify(u.me.name!, "pw");
await u.auth.setPassword(u.me.id, "newpw");

await u.sys.setConfig("server.name", "My Game");
const t = await u.sys.gameTime();

await u.chan.join("Public", "pub");
await u.chan.create("Staff", { header: "%ch[STAFF]%cn", hidden: true });

const bio = await u.attr.get(u.me.id, "FINGER-INFO");
await u.attr.set(u.me.id, "BIO", "Tall and lanky.");

await u.events.emit("game:levelup", { id: u.me.id, lvl: 5 });
```

### `u.eval` / `u.evalString` / `u.trigger`

```typescript
const score = await u.eval(u.me.id, "SCORE-FORMULA");
const rendered = await u.evalString("[name(me)] is here.");
await u.trigger(u.here.id, "ONENTER", [u.me.id]);
```

### `u.force` / `u.forceAs` / `u.execute`

```typescript
await u.force("look");
await u.forceAs(npcId, "say Welcome.");
await u.execute("@pemit #3=Server message.");
```

`u.forceAs` is privileged — guard with `u.me.flags.has("wizard")` etc.

---

## Database

### `DBO<T>`

Generic Deno KV collection. Use for plugin-scoped storage. Always prefix
the namespace with your plugin name.

```typescript
import { DBO } from "jsr:@ursamu/ursamu";

const scores = new DBO<{ player: string; score: number }>("myplugin.scores");
await scores.create({ player: "Alice", score: 100 });
const all = await scores.all();
const top = await scores.queryOne({ player: "Alice" });
await scores.modify({ player: "Alice" }, "$inc", { score: 1 });
await scores.modify({ player: "Alice" }, "$push", { history: Date.now() });
```

Ops: `$set`, `$inc`, `$unset`, `$push` (atomic CAS append).

### `dbojs`

The shared game-object collection (`IDBOBJ`).

```typescript
import { dbojs } from "jsr:@ursamu/ursamu";

const players = await dbojs.find({ flags: { $in: ["player"] } });
const room = await dbojs.queryOne({ id: "1" });
```

---

## Locks & permissions

Lock strings combine **lockfuncs** with the operators `&&`, `||`, `!`, and
`()`. Legacy `&` / `|` still work. Max length 4096 chars / 256 tokens.

Built-in lockfuncs:

| Func | Example | Passes when |
|------|---------|-------------|
| `flag(name)` | `flag(wizard)` | enactor has the flag |
| `attr(name)` | `attr(tribe)` | enactor.state has own property `name` |
| `attr(name, val)` | `attr(tribe, glasswalker)` | `state[name] === val` |
| `type(name)` | `type(player)` | enactor has the type flag |
| `is(#id)` | `is(#5)` | `enactor.id === "5"` |
| `holds(#id)` | `holds(#12)` | enactor.contents includes `#12` |
| `perm(level)` | `perm(admin)` | passes privilege ladder check |

### `registerLockFunc(name, fn)`

Register a custom lockfunc. Built-in names are protected.

```typescript
import { registerLockFunc } from "jsr:@ursamu/ursamu";

registerLockFunc("tribe", (enactor, _target, args) =>
  String(enactor.state.tribe ?? "").toLowerCase() === args[0]?.toLowerCase()
);

// lock: "tribe(glasswalker) || perm(admin)"
```

### `evaluateLock(lock, enactor, target?)`

Returns `Promise<boolean>`. Fail-closed on unknown funcs or parse errors.

### `validateLock(lock)`

Throws on syntax error. Use to validate user-supplied lock strings.

---

## Format handlers

Pluggable display formatters for engine and plugin output. Resolution
priority: per-object softcode attribute → registered TS handler →
registered MUSH template → built-in default.

`FormatSlot` is an **open union** (v2.3.4+). The eight engine-known slots
get IDE autocomplete:

```
NAMEFORMAT  DESCFORMAT  CONFORMAT   EXITFORMAT
WHOFORMAT   WHOROWFORMAT  PSFORMAT  PSROWFORMAT
```

Plugins may register any `UPPERCASE` slot (e.g. `"MAILFORMAT"`,
`"BBROWFORMAT"`) without casts.

### `registerFormatHandler(slot, fn)`

```typescript
registerFormatHandler("NAMEFORMAT", (u, target, defaultName) => {
  if (!target.flags.has("room")) return null;
  return `%ch%cy[${defaultName}]%cn\n`;
});
```

Return `null` to fall through. First non-null handler wins. Returns the
registered function so `unregisterFormatHandler` can remove it.

### `registerFormatTemplate(slot, mushSource)` *(v2.4.0)*

Install a MUSH-softcode template. `%0` binds to the default rendering.

```typescript
const fn = registerFormatTemplate(
  "NAMEFORMAT",
  "[center(strcat(%cy[ ,%0, ]%cn),78,=)]",
);
// remove() ...
unregisterFormatHandler("NAMEFORMAT", fn);
```

### `unregisterFormatHandler(slot, fn)`

Remove a handler by reference identity.

### `resolveFormat(target, slot, defaultArg)`

Two-step lookup for target-bound formats: softcode attr on `target` →
registered handler. Returns `string | null`.

### `resolveFormatOr(target, slot, defaultArg, fallback)`

As above, but always returns a string.

### `resolveGlobalFormat(enactor, slot, defaultArg)` *(v2.3.3)*

Two-tier lookup for global-list formats (WHO, @ps, +mail, +bb): `#0` →
enactor. Returns `string | null`.

### `resolveGlobalFormatOr(enactor, slot, defaultArg, fallback)`

Always returns a string.

### `header(title, width?)` / `divider(width?)` / `footer(width?)`

Native TS layout helpers for block-style section rules. Distinct from the
softcode helpers of the same name.

```typescript
u.send(header("Stats", 78));
u.send(divider(78));
u.send(footer(78));
```

### Types

```typescript
type FormatHandler = (
  u: IUrsamuSDK,
  target: IDBObj,
  defaultArg: string,
) => Promise<string | null> | string | null;

type FormatSlot = "NAMEFORMAT" | "DESCFORMAT" | "CONFORMAT" | "EXITFORMAT"
  | "WHOFORMAT" | "WHOROWFORMAT" | "PSFORMAT" | "PSROWFORMAT"
  | (string & {});
```

---

## Softcode extension

### `registerSoftcodeFunc(name, fn)`

Register a custom stdlib function callable from softcode as `name(args)`.

```typescript
import { registerSoftcodeFunc } from "jsr:@ursamu/ursamu";

registerSoftcodeFunc("double", (_ctx, args) =>
  String(Number(args[0]) * 2)
);
```

### `registerSoftcodeSub(char, handler)`

Register a custom `%X` substitution.

```typescript
registerSoftcodeSub("$", (ctx) => `[$${ctx.enactor.id}]`);
```

### `softcodeService`

The evaluator instance. Exposed for plugin integration tests.

```typescript
import { softcodeService } from "jsr:@ursamu/ursamu";
const out = await softcodeService.eval({ enactor, executor, source: "[add(2,3)]" });
```

---

## Hooks & events

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";
import type { SessionEvent, SayEvent } from "jsr:@ursamu/ursamu";

const onLogin = (e: SessionEvent) => console.log(`${e.player.name} logged in`);
gameHooks.on("player:login", onLogin);

// In plugin remove() — same function reference required:
gameHooks.off("player:login", onLogin);
```

`GameHookMap` event names:

```
player:login      player:logout
say               pose             page             move
channel:message
object:created    object:destroyed object:modified
scene:created     scene:pose       scene:set
scene:title       scene:clear
mail:received
```

Each has a typed payload (`SessionEvent`, `SayEvent`, `PoseEvent`,
`PageEvent`, `MoveEvent`, `ChannelMessageEvent`, `ObjectCreatedEvent`,
`ObjectDestroyedEvent`, `ObjectModifiedEvent`, `SceneCreatedEvent`,
`ScenePoseEvent`, `SceneSetEvent`, `SceneTitleEvent`, `SceneClearEvent`,
`MailReceivedEvent`).

---

## REST & UI

### `registerPluginRoute(prefix, handler)`

Attach a REST handler. Always return 401 before doing work when `userId`
is null on a protected route.

```typescript
registerPluginRoute("/api/v1/my-plugin", async (req, userId) => {
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ok: true, userId });
});
```

Handler signature: `(req: Request, userId: string | null) => Promise<Response>`.

### `registerUIComponent(component)` / `unregisterUIComponent(id)` / `getRegisteredUIComponents()`

Expose a UI element via `GET /api/v1/ui-manifest`.

```typescript
import type { IUIComponent } from "jsr:@ursamu/ursamu";

const comp: IUIComponent = {
  id: "myplugin.panel",
  type: "panel",
  title: "My Panel",
  url: "/plugins/myplugin/panel.html",
  requires: { flag: "builder" },
};
registerUIComponent(comp);
```

---

## Stat systems

Plugins can register a pluggable stat/skill system, queryable by name.

```typescript
import { registerStatSystem, getDefaultStatSystem } from "jsr:@ursamu/ursamu";
import type { IStatSystem } from "jsr:@ursamu/ursamu";

const system: IStatSystem = { name: "wod5", /* ...impl */ };
registerStatSystem(system, { default: true });

const def = getDefaultStatSystem();
```

Also: `getStatSystem(name)`, `getStatSystemNames(): string[]`.

---

## WebSocket

### `wsService`

Direct access to the WebSocket hub. Used by channel/notification plugins.

### `joinSocketToRoom(socketId, room)`

Subscribe a connected socket to a broadcast room.

### `send(message, target?, options?)`

Module-level broadcast — sends to a socket ID, room ID, or DB object ID.
Same semantics as `u.send` but importable from anywhere.

```typescript
import { send } from "jsr:@ursamu/ursamu";
send("Server reboot in 5 minutes.", "#all");
```

`UserSocket` is the typed socket metadata exported for plugin authors.

---

## Engine context

`GameContext` is the substrate every command runs on (actor, location,
helpers). Most plugin code uses `IUrsamuSDK` instead — `GameContext` is
exposed for low-level integrations.

```typescript
import { buildContext } from "jsr:@ursamu/ursamu";
const ctx = await buildContext({ socketId, actorId });
```

---

## Plugin config

`PluginConfigManager` reads per-plugin scoped values from `config.json`.

```typescript
import { PluginConfigManager } from "jsr:@ursamu/ursamu";

const cfg = new PluginConfigManager("myplugin");
const apiKey = cfg.get<string>("apiKey");
await cfg.set("lastRun", Date.now());
```

---

## Stdlib (TS)

All functions are pure and deterministic. v2.5.1 promoted these from
softcode-only to TS-importable. v2.5.2 added per-instance `Noise`.

### Noise

```typescript
import {
  seedNoise, perlin1, perlin2, perlin3,
  simplex2, worley2, fbm2, ridged2, noiseGrid,
  Noise, createNoise, buildPerm,
} from "jsr:@ursamu/ursamu";

seedNoise(42);
const v = perlin2(0.5, 1.7);

const n = createNoise(123);
const v2 = n.perlin2(0.5, 1.7);
```

| Function | Purpose |
|----------|---------|
| `seedNoise(seed)` | Reseed the singleton noise stream |
| `perlin1/2/3` | Classic Perlin noise (1D/2D/3D), range ~[-1, 1] |
| `simplex2` | 2D simplex noise |
| `worley2` | 2D Worley/cellular noise, returns distance to nearest feature |
| `fbm2` | Fractional Brownian Motion (octave-summed Perlin) |
| `ridged2` | Ridged multifractal noise |
| `noiseGrid(w,h,fn)` | Sample a function over a grid → `number[][]` |
| `buildPerm(seed)` | Build a permutation table for a custom noise impl |
| `Noise` class | Per-instance independent noise stream |
| `createNoise(seed)` | Construct a `Noise` |

### PRNG (`Rng`)

```typescript
import { Rng, createRng } from "jsr:@ursamu/ursamu";

const r = createRng(123);
r.next();        // [0, 1)
r.int(1, 6);     // dice roll
r.pick(["a", "b", "c"]);
```

Per-instance mulberry32 — independent of the softcode RNG.

### Physics

```typescript
import { vreflect, pointInAabb, rayAabb } from "jsr:@ursamu/ursamu";
import type { Vec3 } from "jsr:@ursamu/ursamu";

const reflected = vreflect([1, 0, 0], [0, 1, 0]);
const inside = pointInAabb([5, 5, 5], [0, 0, 0], [10, 10, 10]);
const hit = rayAabb(origin, dir, min, max);
```

### Spatial scalars

```typescript
import {
  dist2d, dist3d, distSq2d, distSq3d,
  manhattan, chebyshev, angle2d, bearing,
} from "jsr:@ursamu/ursamu";

dist2d(0, 0, 3, 4);     // 5
manhattan(0, 0, 3, 4);  // 7
bearing(0, 0, 1, 1);    // radians
```

### Interpolation

```typescript
import { lerp, inverseLerp, remap, smoothstep, smootherstep, clamp }
  from "jsr:@ursamu/ursamu";

lerp(0, 100, 0.5);          // 50
inverseLerp(0, 100, 75);    // 0.75
remap(0, 100, 0, 1, 50);    // 0.5
smoothstep(0, 1, 0.5);      // 0.5 (Hermite curve)
clamp(150, 0, 100);         // 100
```

### Vector ops

```typescript
import { vsize, vsizeSq, vdistance, vdistanceSq, vlerp, vclamp }
  from "jsr:@ursamu/ursamu";
import type { Vec } from "jsr:@ursamu/ursamu";

const a: Vec = [3, 4];
vsize(a);              // 5
vdistance([0, 0], a);  // 5
vlerp([0, 0], a, 0.5); // [1.5, 2]
```

---

## Types

| Type | Purpose |
|------|---------|
| `IUrsamuSDK` | The `u` object — full surface |
| `IDBObj` | Hydrated game object (Set flags, populated contents) |
| `IDBOBJ` | Raw DB record shape |
| `ICmd` | Command registration |
| `IPlugin` | Plugin module export |
| `IPluginDependency` | Entry in `ursamu.plugin.json` deps |
| `IContext` | Low-level command context (legacy) |
| `IMiddlewareFunction` | `(u: IUrsamuSDK) => boolean \| Promise<boolean>` |
| `IStatSystem` | Pluggable stat system |
| `IUIComponent` | UI manifest entry |
| `GameHookMap` | Event-name → payload mapping |
| `FormatHandler` | TS format-handler signature |
| `FormatSlot` | Open uppercase-string union |
| `GameContext` | Engine substrate |
| `UserSocket` | WebSocket metadata |
| `LockFunc` | Custom lockfunc signature |
| `SoftcodeFn` | Custom stdlib function signature |
| `SoftcodeSubHandler` | Custom `%X` handler signature |
| `SoftcodeContext` | Evaluator context |

---

## Internal: plugin install errors

The v2.6.0 plugin installer throws typed errors on failure. They live in
`src/utils/pluginErrors.ts` and are **not currently exported from
`mod.ts`** — they are used internally by the `ursamu plugin install`
flow. Listed here for diagnostic visibility.

```
PluginInstallError              base class
├─ PluginDepNameError           invalid/missing name in deps entry
├─ PluginDepUrlError            invalid/missing url
├─ PluginCloneError             git clone failed
├─ PluginRenameError            move into plugins/ failed
├─ PluginVersionError           installed plugin missing version manifest
├─ PluginSemverError            installed version doesn't satisfy dep range
└─ PluginConflictError          two deps disagree on resolved version
```

On any throw the installer's `InstallTxn` rolls back every directory and
registry mutation made during the run.
