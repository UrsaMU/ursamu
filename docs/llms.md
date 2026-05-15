# UrsaMU — AI Reference

> Machine-optimized reference for code generation. Covers all public APIs,
> types, patterns, and conventions. For human-readable guides see docs/guides/.
> **Current version: v2.6.0.** Authoritative API surface lives at
> `src/@types/UrsamuSDK.ts` and is mirrored in
> `.claude/skills/ursamu-dev/references/api-reference.md`.
---

## Overview

UrsaMU is a TypeScript/Deno MUSH-style multiplayer game server. Key characteristics:

- Runtime: **Deno** with Deno KV storage
- Public package: **`jsr:@ursamu/ursamu`**
- Scripts run in isolated **Web Workers** (no Deno APIs, no network, no filesystem)
- Commands registered with `addCmd()` run in native Deno context (full APIs available)
- Configuration in `config/` — JSON or TOML
- Plugins in `src/plugins/<name>/` — auto-discovered at startup
- System scripts in `system/scripts/` — one file per command, auto-registered
---

## Import Paths

```typescript
// All public APIs (v2.6.0)
import {
  addCmd, cmds, registerScript, registerCmdMiddleware,
  registerPluginRoute, registerUIComponent, unregisterUIComponent,
  getRegisteredUIComponents,
  mu, createObj, DBO, dbojs, gameHooks, send, joinSocketToRoom,
  softcodeService, registerSoftcodeFunc, registerSoftcodeSub,
  evaluateLock, validateLock, registerLockFunc,
  registerFormatHandler, registerFormatTemplate, unregisterFormatHandler,
  resolveFormat, resolveFormatOr, resolveGlobalFormat, resolveGlobalFormatOr,
  header, divider, footer,
  registerStatSystem, getStatSystem, getDefaultStatSystem, getStatSystemNames,
  // Stdlib (v2.5.1+): Noise, PRNG, physics, spatial, interpolation, vector
  Noise, createNoise, seedNoise, perlin1, perlin2, perlin3, simplex2,
  worley2, fbm2, ridged2, noiseGrid, buildPerm,
  Rng, createRng,
  vreflect, pointInAabb, rayAabb,
  dist2d, dist3d, distSq2d, distSq3d, manhattan, chebyshev, angle2d, bearing,
  lerp, inverseLerp, remap, smoothstep, smootherstep, clamp,
  vsize, vsizeSq, vdistance, vdistanceSq, vlerp, vclamp,
} from "jsr:@ursamu/ursamu";

// Types (zero runtime cost)
import type {
  ICmd, IPlugin, IDBObj, IUrsamuSDK,
  SayEvent, PoseEvent, PageEvent, MoveEvent, SessionEvent,
  ChannelMessageEvent, SceneCreatedEvent, ScenePoseEvent,
  SceneSetEvent, SceneTitleEvent, SceneClearEvent,
} from "jsr:@ursamu/ursamu";
```

Internal plugin imports (use only within src/plugins/):
```typescript
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
```
---

## IDBObj — Game Object

Every room, player, exit, and item in the database.

```typescript
interface IDBObj {
  id: string;                        // Numeric string: "1", "42"
  name?: string;                     // Display name (shortcut to state.name)
  flags: Set<string>;                // e.g. Set { "player", "connected" }
  location?: string;                 // ID of containing room/object
  state: Record<string, unknown>;    // All stored data (desc, stats, attrs)
  contents: IDBObj[];                // Objects contained by this object
}
```

Common flags:
- `"superuser"` — first player created; highest privilege
- `"admin"` / `"wizard"` — staff level 9; `wizard` requires `superuser` to grant
- `"builder"` — can build rooms/objects
- `"player"` — is a player character
- `"connected"` — currently online
- `"room"` — is a room
- `"exit"` — is an exit
- `"thing"` — is an item
- `"dark"` — hidden from lists
- `"visual"` — others can examine without ownership
---

## IUrsamuSDK — The `u` Object

Injected into every command's `exec()` and into every sandbox script.

```typescript
interface IUrsamuSDK {
  // Context (read-only, injected)
  state:    Record<string, unknown>;          // Per-execution scratch state
  socketId?: string;                          // Caller's WebSocket ID
  me:       IDBObj;                           // The actor
  here:     IDBObj & { broadcast(msg: string, opts?: Record<string,unknown>): void };
  target?:  IDBObj & { broadcast(msg: string, opts?: Record<string,unknown>): void };
  cmd:      {
    name:      string;      // matched command name
    original?: string;      // raw input string
    args:      string[];    // regex capture groups
    switches?: string[];    // ["edit"] from "@cmd/edit ..."
  };

  // Messaging
  send(message: string, target?: string, options?: Record<string,unknown>): void;
  broadcast(message: string, options?: Record<string,unknown>): void;

  // Navigation / execution
  teleport(target: string, destination: string): void;
  execute(command: string): void;         // as actor, full pipeline
  force(command: string): void;           // as actor, bypasses some checks
  forceAs(targetId: string, command: string): Promise<void>;  // as another object

  // Permissions
  canEdit(actor: IDBObj, target: IDBObj): Promise<boolean>;
  checkLock(target: string | IDBObj, lock: string): Promise<boolean>;
  setFlags(target: string | IDBObj, flags: string): Promise<void>;
  trigger(target: string, attr: string, args?: string[]): Promise<void>;
  eval(targetId: string, attr: string, args?: string[]): Promise<string>;

  // Namespaces (all methods async)
  db:     IUrsamuDB;
  util:   IUrsamuUtil;
  auth:   IUrsamuAuth;
  sys:    IUrsamuSys;
  chan:   IUrsamuChan;
  bb:     IUrsamuBB;
  text:   IUrsamuText;
  attr:   IUrsamuAttr;
  events: IUrsamuEvents;
  mail:   IUrsamuMail;   // sandbox scripts only (not in native addCmd)
  ui:     IUrsamuUI;     // web client only
}
```
---

## u.db — Database

```typescript
// Search — returns IDBObj[]
await u.db.search({ flags: /player/i })           // by flag regex
await u.db.search({ flags: /connected/i })         // connected players
await u.db.search({ location: u.here.id })         // objects in room
await u.db.search({ location: u.here.id, flags: /player/i })
await u.db.search({ "data.name": /alice/i })       // by name (case-insensitive)
await u.db.search({ $or: [{ "data.name": /a/i }, { "data.alias": /a/i }] })
await u.db.search("partial name")                  // string search

// Create — returns IDBObj
const obj = await u.db.create({
  flags: new Set(["thing"]),
  location: u.me.id,          // in actor's inventory
  state: { name: "Sword", damage: 5 },
  contents: [],
});

// Modify — op must be "$set", "$unset", or "$inc"
await u.db.modify(u.me.id, "$set", { "data.gold": 100 });           // one field
await u.db.modify(u.me.id, "$set", { data: { ...u.me.state, gold: 100 } }); // full state
await u.db.modify(u.me.id, "$inc", { "data.score": 10 });           // increment
await u.db.modify(u.me.id, "$unset", { "data.tempFlag": "" });      // remove field

// Destroy
await u.db.destroy(obj.id);
```

> **IMPORTANT**: `u.db.modify(id, op, data)` — `op` must be `"$set"`, `"$unset"`,
> or `"$inc"`. Passing `"name"`, `"state"`, or any other string does nothing.
---

## u.util — Utilities

```typescript
// Target resolution (searches inventory → room → global if true)
const obj = await u.util.target(u.me, "sword");       // by name
const obj = await u.util.target(u.me, "#42");          // by ID
const obj = await u.util.target(u.me, "alice", true);  // global search
if (!obj) { u.send("Not found."); return; }

// Display name (applies moniker if set)
u.util.displayName(u.me, u.me)        // actor's own display name
u.util.displayName(target, u.me)      // target's display name as seen by actor

// Strip MUSH codes / ANSI (use before storing or measuring)
u.util.stripSubs("%ch%crDanger!%cn")  // → "Danger!"

// Text alignment (all honor MUSH color codes as zero-width)
u.util.ljust("text", 20)              // "text                "
u.util.rjust("100",  20)              // "                 100"
u.util.center("TITLE", 40, "-")       // "-------------------TITLE------------------"
u.util.center("TITLE", 40)            // "                 TITLE                  "

// Printf formatting
u.util.sprintf("%-10s %5d", "Alice", 1200)   // "Alice       1200"
u.util.sprintf("%05d", 42)                   // "00042"
u.util.sprintf("%.2f%%", 98.6)              // "98.60%"

// Column template
u.util.template(
  "[NNN] [TTTTTTTTTTTTTTTTTTTT]",
  { N: { value: "42", align: "right" }, T: { value: "Title", align: "left" } }
)  // → "[ 42] [Title               ]"

// Map data (optional, may be undefined)
u.util.getMapData?.(targetId, radius)
u.util.parseDesc?.(desc, actor, target)  // async, optional
```
---

## u.auth — Authentication

```typescript
const ok = await u.auth.verify(name, password);     // boolean
await u.auth.login(playerId);                         // connect player
const hash = await u.auth.hash("plaintext");          // bcrypt hash
await u.auth.setPassword(playerId, "newpassword");    // change password
```
---

## u.sys — Server Control

Admin/wizard-only. The SDK does NOT enforce privilege — scripts must check flags.

```typescript
await u.sys.setConfig("game.masterRoom", "42");   // runtime config change
await u.sys.disconnect(socketId);                   // kick a socket
const ms = await u.sys.uptime();                    // uptime in milliseconds
await u.sys.reboot();                               // exit 75 → daemon restarts
await u.sys.shutdown();                             // exit 0 → clean stop
await u.sys.update();                               // git pull origin/main + reboot
await u.sys.update("develop");                      // pull specific branch

// Game time (in-game calendar)
const t: IGameTime = await u.sys.gameTime();        // { year, month, day, hour, minute }
await u.sys.setGameTime({ year: 1340, month: 3, day: 15, hour: 8, minute: 0 });

// IGameTime fields: year, month (1-12), day (1-28), hour (0-23), minute (0-59)
```
---

## u.chan — Channels

```typescript
await u.chan.join("public", "pub");                  // join by name, set alias
await u.chan.leave("pub");                           // leave by alias
const channels = await u.chan.list();               // all channel memberships

// Admin only:
await u.chan.create("events", {
  header: "%ch[EVENTS]%cn",
  lock: "player+",
  hidden: false
});
await u.chan.destroy("events");
await u.chan.set("public", {
  header: "%ch[PUB]%cn",
  masking: true,        // hide speaker names
  logHistory: true,
  historyLimit: 100,
});

// Get recent history (default 20 messages)
const history = await u.chan.history("public");          // last 20
const history = await u.chan.history("public", 50);      // last 50
// → [{ id, playerName, message, timestamp }, ...]
```
---

## u.bb — Bulletin Boards

```typescript
// Read
const boards = await u.bb.listBoards();
// → [{ id, name, description?, order, postCount, newCount }, ...]

const posts = await u.bb.listPosts(boardId);
// → [{ id, num, subject, authorName, date, edited? }, ...]

const post = await u.bb.readPost(boardId, postNum);
// → { id, subject, body, authorName, date, edited? } | null

// Unread counts
const n = await u.bb.newPostCount(boardId);
const total = await u.bb.totalNewCount();
await u.bb.markRead(boardId);

// Write (player)
await u.bb.post(boardId, "Subject", "Body text.");
await u.bb.editPost(boardId, postNum, "Updated body.");
await u.bb.deletePost(boardId, postNum);

// Admin
await u.bb.createBoard("General", { description: "General chat", order: 1 });
await u.bb.destroyBoard(boardId);
```
---

## u.text — Named Text Blobs

Used for MOTD, help pages, templates.

```typescript
const motd = await u.text.read("motd");           // → string (empty if not set)
await u.text.set("motd", "Welcome to the game!");
await u.text.set("motd", "");                     // clear
```
---

## u.attr — Object Attributes

Reads soft-coded `&ATTR` values stored on objects.

```typescript
const val: string | null = await u.attr.get(objectId, "SHORT-DESC");
const val = await u.attr.get(u.me.id, "FINGER-INFO");
// Attribute names are case-insensitive. Returns null if not set.
```
---

## u.mail — Player Mail (sandbox scripts only)

> **Note:** `u.mail` is only available in sandbox scripts (system/scripts/).
> Native `addCmd` handlers should import `mail` from the database directly.

```typescript
// Send
await u.mail.send({
  from: `#${u.me.id}`,          // dbref format: "#42"
  to: [`#${recipientId}`],       // array of dbrefs
  cc: [`#${ccId}`],              // optional
  subject: "Meeting tonight",
  message: "At 8pm in the hall.",
  read: false,
  date: Date.now(),
});

// Read inbox
const inbox = await u.mail.read({ to: { $in: [`#${u.me.id}`] } });
// → IMail[] — sorted manually by date if needed

// Delete
await u.mail.delete(messageId);

// Mark read / modify
await u.mail.modify({ id: messageId }, "$set", { read: true });

// IMail shape:
// { id?: string, from: string, to: string[], cc?: string[],
//   bcc?: string[], subject: string, message: string,
//   read: boolean, date: number }
```
---

## u.events — Server-Wide Pub/Sub

```typescript
// Emit
await u.events.emit("player.levelup", { id: u.me.id, level: 5 });

// Subscribe a stored &ATTR handler
const subId = await u.events.on("player.levelup", "LEVELUP_HANDLER");
// The attribute value is a script that receives event data
```
---

## u.ui — Web Client UI (web client only)

```typescript
// Send structured layout to the web client
u.ui.layout({
  components: [
    { type: "header", title: "Character Sheet" },
    { type: "table", content: [["Name", u.me.name]] },
  ],
  meta: { command: "score" }
});

// Render a template string
const html = u.ui.render("<b>{{name}}</b>", { name: "Alice" });

// Build a panel
u.ui.panel({ type: "list", title: "Who's Online", content: players });
```
---

## u.trigger / u.eval

```typescript
// Fire a stored &ATTR as a script (fire-and-forget)
await u.trigger(objectId, "ONENTER");
await u.trigger(objectId, "USE", ["open"]);
await u.trigger(u.me.id, "ACONNECT");

// Evaluate an attribute and return its output as a string
const result = await u.eval("#42", "FORMULA", ["arg1", "arg2"]);
```
---

## u.forceAs

Execute a command as another object (requires wizard/admin).

```typescript
await u.forceAs(npcId, "say Welcome, traveler!");
await u.forceAs(objectId, "look");
```
---

## ICmd — Command Registration

```typescript
interface ICmd {
  name:      string;                              // unique label
  pattern:   string | RegExp;                     // matched against raw input
  lock?:     string;                              // lock expression
  exec:      (u: IUrsamuSDK) => void | Promise<void>;
  help?:     string;                              // shown in `help <name>`
  hidden?:   boolean;                             // hide from listings
  category?: string;                              // group in help listings
}

addCmd({
  name: "+greet",
  pattern: /^\+greet\s+(.*)/i,
  lock: "connected",
  exec: async (u) => {
    const target = await u.util.target(u.me, u.cmd.args[0]);
    if (!target) { u.send("Who?"); return; }
    const myName = u.util.displayName(u.me, u.me);
    u.send(`You wave to ${u.util.displayName(target, u.me)}.`);
    u.send(`${myName} waves to you.`, target.id);
    u.here.broadcast(`${myName} waves to ${u.util.displayName(target, u.me)}.`);
  },
});
```

### Pattern conventions

```typescript
// No args:        /^inventory$/i
// One arg:        /^look\s+(.*)/i          → args[0]
// Switch + arg:   /^\+cmd(?:\/(\S+))?\s*(.*)/i  → args[0]=switch, args[1]=rest
// Two parts:      /^@name\s+(.+)=(.+)/i    → args[0], args[1]
```

### Lock expressions

| Expression | Meaning |
|-----------|---------|
| `""` | No restriction (login screen) |
| `"connected"` | Must be logged in |
| `"connected builder+"` | Logged in + builder or higher |
| `"connected admin+"` | Logged in + admin or higher |
| `"connected wizard"` | Logged in + wizard |
| `"#42"` | Must be object #42 |
| `"player+"` | Has player flag or higher |
| `"!dark"` | Must NOT have dark flag |
| `"wizard\|admin"` | wizard OR admin |
---

## IPlugin — Plugin Lifecycle

```typescript
interface IPluginDependency {
  name:    string;   // must match another plugin's IPlugin.name exactly
  version: string;   // semver range, e.g. "^1.0.0", ">=2.1.0"
}

interface IPlugin {
  name:          string;
  version:       string;
  description?:  string;
  dependencies?: IPluginDependency[];  // see Plugin Coupling Patterns below
  init?:         () => boolean | Promise<boolean>;  // return false to abort
  remove?:       () => void | Promise<void>;
}

// index.ts
import "./commands.ts";     // register addCmd at module-load time
import type { IPlugin } from "jsr:@ursamu/ursamu";

export const plugin: IPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  init: async () => {
    // seed data, connect external services, etc.
    return true;
  },
  remove: async () => {
    // cleanup
  },
};
```

Plugin is auto-discovered when placed in `src/plugins/<name>/index.ts`.
---

## Exported Functions

### `addCmd(...cmds: ICmd[])`

Registers commands. Call at module level in `commands.ts`, not inside `init()`.

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
addCmd({ name: "+foo", pattern: /^\+foo/i, exec: (u) => u.send("foo") });
```

### `registerPluginRoute(prefix, handler)`

```typescript
import { registerPluginRoute } from "jsr:@ursamu/ursamu";
registerPluginRoute("/api/v1/myplugin", async (req, userId) => {
  return Response.json({ ok: true });
});
// handler: (req: Request, userId: string | null) => Promise<Response>
```

### `DBO<T>` — Plugin database collections

```typescript
import { DBO } from "jsr:@ursamu/ursamu";

interface INote { id: string; playerId: string; text: string; date: number; }
const notes = new DBO<INote>("myplugin.notes");

await notes.create({ id: crypto.randomUUID(), playerId: u.me.id, text: "hello", date: Date.now() });
const all = await notes.find({ playerId: u.me.id });
const one = await notes.findOne({ id: noteId });
await notes.update({ id: noteId }, { text: "updated" });
await notes.delete({ id: noteId });
const all = await notes.all();
```

### `dbojs` — Game objects

```typescript
import { dbojs } from "jsr:@ursamu/ursamu";

const players = await dbojs.queryAll((o) => o.flags.has("player"));
const room    = await dbojs.queryOne((o) => o.id === "1");
```

### `createObj(template)` — Outside command context

```typescript
import { createObj } from "jsr:@ursamu/ursamu";
const room = await createObj({
  name: "The Void", flags: new Set(["room"]),
  state: { desc: "Empty." }, contents: [],
});
```

### `mu()` — Start the server

```typescript
import { mu } from "jsr:@ursamu/ursamu";
await mu();
```
---

## GameHooks — Engine Event Bus

`GameHookMap` is an **interface** — plugins can extend it via TypeScript
declaration merging to add their own typed events without modifying the engine:

```typescript
// In your plugin's augmentation file:
import type { IJob } from "./types.ts";
declare module "../../../services/Hooks/GameHooks.ts" {
  interface GameHookMap {
    "job:created": (job: IJob) => void | Promise<void>;
  }
}
```

Once imported, all `gameHooks.on/off/emit` calls become fully typed for the
new event across the entire codebase.

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";

gameHooks.on("player:login", ({ actorId, actorName }) => { /* ... */ });
gameHooks.off("player:login", handler);
await gameHooks.emit("player:login", payload);
```

### Built-in events

| Event | Payload fields |
|-------|---------------|
| `player:say` | `actorId`, `actorName`, `roomId`, `message` |
| `player:pose` | `actorId`, `actorName`, `roomId`, `content`, `isSemipose` |
| `player:page` | `actorId`, `actorName`, `targetId`, `targetName`, `message` |
| `player:move` | `actorId`, `actorName`, `fromRoomId`, `toRoomId`, `fromRoomName`, `toRoomName`, `exitName` |
| `player:login` | `actorId`, `actorName` |
| `player:logout` | `actorId`, `actorName` |
| `channel:message` | `channelName`, `senderId`, `senderName`, `message` |
| `scene:created` | `sceneId`, `sceneName`, `roomId`, `actorId`, `actorName`, `sceneType` |
| `scene:pose` | `sceneId`, `sceneName`, `roomId`, `actorId`, `actorName`, `msg`, `type` |
| `scene:set` | `sceneId`, `sceneName`, `roomId`, `actorId`, `actorName`, `description` |
| `scene:title` | `sceneId`, `oldName`, `newName`, `actorId`, `actorName` |
| `scene:clear` | `sceneId`, `sceneName`, `actorId`, `actorName`, `status` |
---

## Script System

Scripts live in `system/scripts/`. File name = command name.

### ESM style (recommended for complex scripts)

```typescript
// system/scripts/mycommand.ts
export default async (u: IUrsamuSDK) => {
  // full access to u.*
};

export const aliases = ["myalias", "mc"];  // optional extra trigger names
```

### Legacy block style (simple scripts, no export)

```typescript
// system/scripts/gold.ts  (no export = block mode)
const gold = (u.me.state.gold as number) || 0;
u.send(`You have ${gold} gold.`);
```

### ESM import restrictions in scripts

Workers support standard ESM imports BUT:
- JSR sub-path imports (`jsr:@std/fmt/printf`) do NOT work — use u.util.sprintf instead
- Cannot import from `jsr:@ursamu/ursamu` inside scripts — use the `u` global
---

## MUSH Color Codes

| Code | Effect |
|------|--------|
| `%ch` | Bold / bright |
| `%cn` | Reset to normal |
| `%cr` | Red |
| `%cg` | Green |
| `%cb` | Blue |
| `%cy` | Yellow (actually cyan in some terminals) |
| `%cw` | White |
| `%cc` | Cyan |
| `%cm` | Magenta |
| `%cx` | Dark gray |
| `%n` | Actor's name |
| `%r` / `%R` | Newline |
| `%t` | Tab |
| `%b` | Space |

```typescript
u.send("%ch%cyWelcome!%cn");
u.send(`%ch%cr[ALERT]%cn Server restarting.`);
u.send(u.util.center("%ch=== NEWS ===%cn", 78, "="));
```

Strip all codes: `u.util.stripSubs(str)` — use before storing or measuring length.
---

## Project Layout

```
src/
  @types/          Type definitions (IDBObj, ICmd, IPlugin, etc.)
  commands/        Native addCmd registrations (admin, mail, help, etc.)
  plugins/         Plugin directory — each sub-folder is a plugin
  routes/          HTTP route handlers (scenes, mail, wiki, etc.)
  services/        Core services (Database, Sandbox, GameClock, Hooks, etc.)
  utils/           Shared utilities (flags, target, locks, etc.)
system/
  scripts/         Auto-loaded scripts (one per command: look.ts, say.ts, etc.)
  help/            In-game help text files
config/            Game configuration (config.json / config.toml)
docs/              Documentation site (Lume static site generator)
tests/             Test suite (Deno test)
```
---

## Common Patterns

### Permission guard (admin/wizard)

```typescript
const isAdmin = u.me.flags.has("admin") ||
                u.me.flags.has("wizard") ||
                u.me.flags.has("superuser");
if (!isAdmin) { u.send("Permission denied."); return; }
```

### Edit permission check

```typescript
if (!(await u.canEdit(u.me, target))) {
  u.send("Permission denied.");
  return;
}
```

### Standard switch-based command

```typescript
addCmd({
  name: "+cmd",
  pattern: /^\+cmd(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();
    if (!sw || sw === "list") { /* default */ return; }
    if (sw === "view")  { /* ... */ return; }
    if (sw === "create") { /* ... */ return; }
    u.send(`Unknown switch "/${sw}".`);
  },
});
```

### Read and write a state field

```typescript
// READ
const gold = (u.me.state.gold as number) || 0;

// WRITE (spread to preserve existing fields)
await u.db.modify(u.me.id, "$set", { "data.gold": gold + 10 });

// Or write the entire state object (safe for small objects):
await u.db.modify(u.me.id, "$set", { data: { ...u.me.state, gold: gold + 10 } });
```

### Increment a counter

```typescript
await u.db.modify(u.me.id, "$inc", { "data.deaths": 1 });
```

### Multi-column output table

```typescript
const lines: string[] = [];
lines.push(u.util.center("%ch=== WHO ===%cn", 78, "="));
for (const p of online) {
  lines.push(
    u.util.ljust(u.util.displayName(p, u.me), 25) +
    u.util.rjust(`${idle}m`, 6)
  );
}
lines.push("=".repeat(78));
u.send(lines.join("\r\n"));
```

### Register a plugin REST route

```typescript
registerPluginRoute("/api/v1/myplugin", async (req, userId) => {
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (req.method === "GET") {
    return Response.json({ data: await notes.find({ playerId: userId }) });
  }
  return Response.json({ error: "Not found" }, { status: 404 });
});
```

### Listen for a game hook in a plugin

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";
import type { SessionEvent } from "jsr:@ursamu/ursamu";

const onLogin = ({ actorId, actorName }: SessionEvent) => {
  console.log(`[myplugin] ${actorName} connected`);
};

export const plugin: IPlugin = {
  name: "myplugin", version: "1.0.0",
  init: () => { gameHooks.on("player:login", onLogin); return true; },
  remove: () => { gameHooks.off("player:login", onLogin); },
};
```
---

## REST API — Core Endpoints

Authentication: pass `Authorization: Bearer <jwt>` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/login` | No | Login — returns JWT |
| `GET` | `/api/v1/who` | Yes | Online players list |
| `GET` | `/api/v1/players/:id` | Yes | Player info |
| `GET` | `/api/v1/scenes` | Yes | Scene list |
| `POST` | `/api/v1/scenes` | Yes | Open a new scene |
| `GET` | `/api/v1/scenes/:id` | Yes | Scene detail |
| `PATCH` | `/api/v1/scenes/:id` | Yes | Update scene |
| `POST` | `/api/v1/scenes/:id/pose` | Yes | Post to scene |
| `GET` | `/api/v1/scenes/:id/export` | Yes | Export scene (`?format=markdown\|json`) |
| `GET` | `/api/v1/mail` | Yes | Inbox list |
| `POST` | `/api/v1/mail` | Yes | Send mail |
| `GET` | `/api/v1/mail/:id` | Yes | Read message |
| `DELETE` | `/api/v1/mail/:id` | Yes | Delete message |
| `GET` | `/api/v1/wiki` | Yes | List/search wiki |
| `GET` | `/api/v1/wiki/:path` | Yes | Read page |
| `POST` | `/api/v1/wiki` | Staff | Create page |
| `PATCH` | `/api/v1/wiki/:path` | Staff | Update page |
| `DELETE` | `/api/v1/wiki/:path` | Staff | Delete page |
---

---

## Plugin Coupling Patterns

### Rule: never use `@ursamu/ursamu/*` sub-paths inside `src/plugins/`

When running the engine directly, Deno resolves `@ursamu/ursamu` from the
local `deno.json` — not from JSR. A sub-path export that is absent from the
local `deno.json` will halt startup even if the published JSR version has it.

| Context | Correct import |
|---|---|
| Plugin importing another **bundled** plugin | Relative: `../../jobs/mod.ts` |
| External plugin (separate repo) importing engine types | Sub-path: `@ursamu/ursamu/jobs` |

### Two strategies for plugin-to-plugin communication

**Tight coupling — use `dependencies`**

When plugin B genuinely cannot function without plugin A's API (types, DB
access, configuration):

```typescript
// discord/src/index.ts
export const plugin: IPlugin = {
  name: "discord",
  version: "1.1.0",
  dependencies: [{ name: "chargen", version: ">=1.0.0" }],
  // chargen is guaranteed to be init()'d before discord
};
```

Startup behavior:
- Dep missing or version out of range → **throws, server halts**
- Dep's `init()` returned false → dependent is cascade-skipped, server continues
- Circular dependency → **throws, server halts** (fix: use `gameHooks` instead)

**Loose coupling — use `gameHooks` declaration merging**

When plugin B only needs to *react* to plugin A's lifecycle events (no types,
no direct API calls):

```typescript
// In plugin A (jobs) — game-hooks-augment.ts:
declare module "../../../services/Hooks/GameHooks.ts" {
  interface GameHookMap {
    "job:created": (job: IJob) => void | Promise<void>;
  }
}

// In plugin A's hooks.ts — bridge emit to gameHooks:
await gameHooks.emit("job:created", job);   // fires AFTER jobHooks subscribers

// In plugin B (discord) — no jobs import needed:
import { gameHooks } from "@ursamu/ursamu";
gameHooks.on("job:created", async (job) => { /* post to webhook */ });
```

Loose coupling means:
- Plugin B has no `dependencies` entry for plugin A
- Plugin B works whether or not plugin A is installed
- No import resolution errors regardless of JSR publish state

### Case study: discord → jobs import error

**Symptom** (`deno task start`):
```
Error loading plugin from .../discord/index.ts:
  TypeError: Unknown export './jobs' for '@ursamu/ursamu'.
```

**Root cause**: `discord/src/job-hooks.ts` imported `jobHooks` from
`@ursamu/ursamu/jobs`. When running the engine directly, `@ursamu/ursamu`
resolves to the local `deno.json` whose exports did not include `./jobs`.

**Wrong fix**: Add `"./jobs": "..."` to `deno.json` exports and leave the
cross-plugin import as-is. This silences the error locally but doesn't address
the architectural problem.

**Right fix (applied)**:
1. `GameHookMap` changed from `type` to `interface` — enables declaration merging.
2. Jobs plugin added `game-hooks-augment.ts` extending `GameHookMap` with
   `job:created`, `job:commented`, etc.
3. Jobs `jobHooks.emit()` now also bridges to `gameHooks.emit()`.
4. Discord `job-hooks.ts` uses `gameHooks.on("job:created", ...)` —
   no import from the jobs plugin at all.

Result: discord no longer declares a `jobs` dependency. It reacts to job
events whether or not it knows jobs is installed.
---

*Generated from `src/@types/UrsamuSDK.ts`, `src/services/Sandbox/worker.ts`, and source review. Last updated: 2026-05-15 (v2.6.0).*
