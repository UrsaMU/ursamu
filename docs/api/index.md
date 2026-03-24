---
layout: layout.vto
title: API Reference
description: Quick-reference index for all public UrsaMU APIs — imports, types, commands, database, hooks, and REST endpoints.
nav:
  - text: REST API
    url: "./rest.md"
  - text: Imports
    url: "#imports"
  - text: Types
    url: "#types"
  - text: addCmd
    url: "#addcmd"
  - text: u.db
    url: "#udb"
  - text: u.* Quick Reference
    url: "#u-quick-reference"
  - text: dbojs
    url: "#dbojs"
  - text: DBO<T>
    url: "#dbot"
  - text: GameHooks
    url: "#gamehooks"
  - text: REST API
    url: "#rest-api"
  - text: For AI tools
    url: "#for-ai-tools"
---

# API Reference

Quick-reference index for all public UrsaMU APIs. For full documentation of
each section, see [Core API Reference](./core.md).

---

## Imports

```typescript
// All public APIs
import {
  addCmd, registerPluginRoute, mu, createObj, DBO, dbojs, gameHooks
} from "jsr:@ursamu/ursamu";

// Types (zero runtime cost)
import type {
  ICmd, IPlugin, IDBObj, IUrsamuSDK,
  SayEvent, PoseEvent, PageEvent, MoveEvent, SessionEvent,
  ChannelMessageEvent, SceneCreatedEvent, ScenePoseEvent,
  SceneSetEvent, SceneTitleEvent, SceneClearEvent,
} from "jsr:@ursamu/ursamu";
```

Internal plugins may use direct paths:
```typescript
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
```

---

## Types

| Type | Description |
|------|-------------|
| `IDBObj` | Every game object — room, player, exit, item |
| `IUrsamuSDK` | The `u` object injected into commands and scripts |
| `ICmd` | Command registration descriptor passed to `addCmd()` |
| `IPlugin` | Plugin lifecycle interface |
| `IGameTime` | In-game calendar: `{ year, month, day, hour, minute }` |

See [Core API Reference](./core.md) for full type definitions.

---

## addCmd

Registers one or more in-game commands at module-load time.

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

addCmd({
  name:    "+greet",
  pattern: /^\+greet\s+(.*)/i,   // capture groups → u.cmd.args[0], args[1], …
  lock:    "connected",
  exec: async (u: IUrsamuSDK) => {
    const target = await u.util.target(u.me, u.cmd.args[0]);
    if (!target) { u.send("Who?"); return; }
    u.send(`You wave to ${u.util.displayName(target, u.me)}.`);
  },
  help:     "+greet <name>\nWave at someone.",
  category: "Social",
});
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique label; appears in help listings |
| `pattern` | `RegExp` | Matched against raw player input |
| `lock` | `string?` | Lock expression. Fails silently. |
| `exec` | `(u) => void\|Promise<void>` | Command body |
| `help` | `string?` | Shown by `help <name>` |
| `hidden` | `boolean?` | Hide from help/command listings |
| `category` | `string?` | Groups commands in listings |

### Lock expression quick reference

| Value | Meaning |
|-------|---------|
| `""` | No restriction (login-screen commands) |
| `"connected"` | Player must be logged in |
| `"connected builder+"` | Logged in + builder flag or higher |
| `"connected admin+"` | Logged in + admin or higher |
| `"connected wizard"` | Logged in + wizard (level 9, superuser-only grant) |
| `"#42"` | Must be exactly object #42 |
| `"!dark"` | Must NOT have the dark flag |
| `"wizard\|admin"` | wizard OR admin |

---

## u.db

Database operations. All methods are `async`. Available in both `addCmd` handlers
and sandbox scripts.

| Method | Signature | Returns |
|--------|-----------|---------|
| `search` | `(query: string \| object) => Promise<IDBObj[]>` | Array of matching objects |
| `create` | `(template: Partial<IDBObj>) => Promise<IDBObj>` | Newly created object |
| `modify` | `(id, op, data) => Promise<void>` | — |
| `destroy` | `(id: string) => Promise<void>` | — |

**`modify` ops:** `"$set"` (merge), `"$unset"` (remove field), `"$inc"` (increment number).
Do not pass any other string — it is rejected.

```typescript
// Merge a field
await u.db.modify(u.me.id, "$set", { "data.gold": 100 });

// Full state replace (always spread to preserve other fields)
await u.db.modify(u.me.id, "$set", { data: { ...u.me.state, gold: 100 } });

// Increment
await u.db.modify(u.me.id, "$inc", { "data.deaths": 1 });

// Remove a field
await u.db.modify(u.me.id, "$unset", { "data.tempAttr": "" });
```

**Search examples:**

```typescript
const online  = await u.db.search({ flags: /connected/i });
const rooms   = await u.db.search({ flags: /room/i });
const here    = await u.db.search({ location: u.here.id });
const byName  = await u.db.search({ "data.name": /alice/i });
const found   = await u.db.search({ $or: [
  { "data.name": /alice/i }, { "data.alias": /alice/i }
]});
```

---

## u.* Quick Reference

All namespaces on the `u` SDK object. Every method is `async` (returns a Promise).

### Top-level methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `send` | `(msg, target?, opts?) => void` | Send to actor or target ID |
| `broadcast` | `(msg, opts?) => void` | Send to all connected players |
| `teleport` | `(target, dest) => void` | Move target to dest |
| `execute` | `(cmd) => void` | Run command as actor |
| `force` | `(cmd) => void` | Force command as actor |
| `forceAs` | `(targetId, cmd) => Promise<void>` | Force command as another object |
| `canEdit` | `(actor, target) => Promise<boolean>` | Owner / admin check |
| `checkLock` | `(target, lock) => Promise<boolean>` | Evaluate lock expression |
| `setFlags` | `(target, flags) => Promise<void>` | Add / remove flags |
| `trigger` | `(target, attr, args?) => Promise<void>` | Fire a stored &ATTR |
| `eval` | `(targetId, attr, args?) => Promise<string>` | Evaluate &ATTR, return output |

### u.util

| Method | Description |
|--------|-------------|
| `target(actor, query, global?)` | Resolve name/ID to IDBObj |
| `displayName(obj, actor)` | Name with moniker applied |
| `stripSubs(str)` | Strip MUSH codes and ANSI escapes |
| `ljust(str, len, fill?)` | Left-align to width |
| `rjust(str, len, fill?)` | Right-align to width |
| `center(str, len, fill?)` | Center in width |
| `sprintf(fmt, ...args)` | Printf-style formatting |
| `template(pattern, data)` | Column-format template |

### u.auth

| Method | Description |
|--------|-------------|
| `verify(name, password)` | Returns `boolean` |
| `login(id)` | Connect player to session |
| `hash(password)` | bcrypt hash |
| `setPassword(id, password)` | Change password |

### u.sys

| Method | Description |
|--------|-------------|
| `setConfig(key, value)` | Set runtime config |
| `disconnect(socketId)` | Kick a connection |
| `uptime()` | Milliseconds since start |
| `reboot()` | Exit 75 — daemon restarts |
| `shutdown()` | Exit 0 — clean stop |
| `update(branch?)` | git pull + reboot |
| `gameTime()` | Returns `IGameTime` |
| `setGameTime(t)` | Set in-game calendar |

### u.chan

| Method | Description |
|--------|-------------|
| `join(channel, alias)` | Join channel with alias |
| `leave(alias)` | Leave by alias |
| `list()` | List memberships |
| `create(name, opts?)` | Admin: create channel |
| `destroy(name)` | Admin: delete channel |
| `set(name, opts)` | Admin: update channel |
| `history(name, limit?)` | Recent messages (default 20) |

### u.bb

| Method | Description |
|--------|-------------|
| `listBoards()` | All boards with unread counts |
| `listPosts(boardId)` | Posts on a board |
| `readPost(boardId, num)` | Read one post |
| `post(boardId, subj, body)` | Create a post |
| `editPost(boardId, num, body)` | Edit a post |
| `deletePost(boardId, num)` | Delete a post |
| `createBoard(name, opts?)` | Admin: create board |
| `destroyBoard(boardId)` | Admin: delete board |
| `markRead(boardId)` | Mark board as read |
| `newPostCount(boardId)` | Unread count for one board |
| `totalNewCount()` | Total unread across all boards |

### u.text

| Method | Description |
|--------|-------------|
| `read(id)` | Read named text blob |
| `set(id, content)` | Write named text blob |

### u.attr

| Method | Description |
|--------|-------------|
| `get(id, name)` | Read a soft-coded &ATTR value. Returns `string \| null`. Case-insensitive. |

### u.mail *(sandbox scripts only)*

| Method | Description |
|--------|-------------|
| `send(mail)` | Send a message |
| `read(query)` | Query inbox |
| `delete(id)` | Delete by ID |
| `modify(query, op, update)` | Update (e.g. mark read) |

### u.events

| Method | Description |
|--------|-------------|
| `emit(event, data, ctx?)` | Fire server-wide event |
| `on(event, handlerAttr)` | Subscribe &ATTR handler |

---

## dbojs

Direct game-object database access (for plugins and startup code, not scripts).

```typescript
import { dbojs } from "jsr:@ursamu/ursamu";

const players = await dbojs.queryAll((o) => o.flags.has("player"));
const room    = await dbojs.queryOne((o) => o.id === "1");
// queryOne returns IDBOBJ | undefined | false
```

---

## DBO\<T\>

Typed plugin-specific database collections backed by Deno KV.

```typescript
import { DBO } from "jsr:@ursamu/ursamu";

interface INote { id: string; playerId: string; text: string; date: number; }
const notes = new DBO<INote>("myplugin.notes");

await notes.create({ id: crypto.randomUUID(), playerId: u.me.id, text: "hi", date: Date.now() });
const all  = await notes.find({ playerId: u.me.id });
const one  = await notes.findOne({ id: noteId });
await notes.update({ id: noteId }, { text: "updated" });
await notes.delete({ id: noteId });
```

---

## GameHooks

Typed event bus for the 12 built-in engine events.

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";

const handler = ({ actorId, actorName }: SessionEvent) => { /* ... */ };
gameHooks.on("player:login", handler);
gameHooks.off("player:login", handler);    // call in plugin remove()
```

### Event catalog

| Event | Key payload fields |
|-------|------------------|
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

Other hook buses (from specific plugins):
- `wikiHooks` — `wiki:created`, `wiki:edited`, `wiki:deleted`
- `eventHooks` — `event:created`, `event:updated`, `event:deleted`, `event:started`, `event:ended`, `event:rsvp`, `event:cancelled`

---

## REST API

Authentication: `Authorization: Bearer <jwt>` header on all protected routes.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/login` | No | Login — returns JWT |
| `GET` | `/api/v1/who` | Yes | Online players |
| `GET` | `/api/v1/players/:id` | Yes | Player info |
| `GET` | `/api/v1/scenes` | Yes | Scene list |
| `POST` | `/api/v1/scenes` | Yes | Open scene |
| `GET` | `/api/v1/scenes/:id` | Yes | Scene detail |
| `PATCH` | `/api/v1/scenes/:id` | Yes | Update scene |
| `POST` | `/api/v1/scenes/:id/pose` | Yes | Post to scene |
| `GET` | `/api/v1/scenes/:id/export` | Yes | Export (`?format=markdown\|json`) |
| `GET` | `/api/v1/mail` | Yes | Inbox |
| `POST` | `/api/v1/mail` | Yes | Send mail |
| `GET` | `/api/v1/mail/:id` | Yes | Read message |
| `DELETE` | `/api/v1/mail/:id` | Yes | Delete message |
| `GET` | `/api/v1/wiki` | Yes | List / search wiki |
| `GET` | `/api/v1/wiki/:path` | Yes | Read wiki page |
| `POST` | `/api/v1/wiki` | Staff | Create page |
| `PATCH` | `/api/v1/wiki/:path` | Staff | Update page |
| `DELETE` | `/api/v1/wiki/:path` | Staff | Delete page |
| `PUT` | `/api/v1/wiki/:path.ext` | Staff | Upload static asset |

---

## For AI Tools

For a single dense reference optimized for AI code generation, see:

**[`/docs/llms.md`](../llms.md)** — complete type signatures, all method signatures,
common patterns, and MUSH color codes in one flat document.
