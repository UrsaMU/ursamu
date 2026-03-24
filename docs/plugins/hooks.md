---
layout: layout.vto
description: Typed event hooks for reacting to game, scene, wiki, and custom events
---

# Plugin Hooks & Events

UrsaMU ships two complementary event systems. Choose the one that fits your use case:

| System | Best for |
|--------|----------|
| **GameHooks** | Reacting to engine-level events (player login, movement, say, scene changes) from TypeScript plugin code |
| **EventsService** | Running sandbox scripts when custom events fire; in-game `u.events.on/emit` scripting |

Both are safe to use together in the same plugin.
---

## GameHooks

`gameHooks` is a typed, singleton event bus exported from `mod.ts`. It fires
for 12 built-in engine events and is the correct way to react to player and
scene activity without modifying core command files.

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";

// Subscribe
gameHooks.on("player:login", ({ actorId, actorName }) => {
  console.log(`[GM] ${actorName} connected.`);
});

// Unsubscribe (pass the same function reference)
gameHooks.off("player:login", myHandler);
```

### API

```typescript
gameHooks.on(event, handler)   // subscribe — idempotent (no double-register)
gameHooks.off(event, handler)  // unsubscribe
await gameHooks.emit(event, payload)  // fire all handlers; errors are caught per-handler
```

**Error isolation** — a throwing handler is logged and skipped; subsequent
handlers still run.

**Fire-and-forget pattern** (used throughout the engine):

```typescript
gameHooks.emit("player:login", payload)
  .catch((e) => console.error("[hooks] player:login error:", e));
```
---

### Player Events

#### `player:say`

Fires when a player speaks in a room via `say` / `"`.

```typescript
gameHooks.on("player:say", ({ actorId, actorName, roomId, message }) => {
  // actorId   — DB id of the speaker
  // actorName — display name
  // roomId    — room where the message was spoken
  // message   — the spoken text (raw, may contain MUSH codes)
});
```

#### `player:pose`

Fires when a player poses/emotes via `pose` / `:` / `;`.

```typescript
gameHooks.on("player:pose", ({ actorId, actorName, roomId, content, isSemipose }) => {
  // content    — full formatted content, e.g. "Alice grins."
  // isSemipose — true when ; shorthand was used (no space between name and text)
});
```

#### `player:page`

Fires when a player pages another player.

```typescript
gameHooks.on("player:page", ({ actorId, actorName, targetId, targetName, message }) => {});
```

#### `player:move`

Fires when a player traverses an exit.

```typescript
gameHooks.on("player:move", ({
  actorId, actorName,
  fromRoomId, toRoomId,
  fromRoomName, toRoomName,
  exitName,         // e.g. "North"
}) => {});
```

#### `player:login`

Fires when a player connects and logs in.

```typescript
gameHooks.on("player:login", ({ actorId, actorName }) => {});
```

#### `player:logout`

Fires when a player disconnects.

```typescript
gameHooks.on("player:logout", ({ actorId, actorName }) => {});
```

#### `channel:message`

Fires when a player speaks on a channel.

```typescript
gameHooks.on("channel:message", ({ channelName, senderId, senderName, message }) => {});
```
---

### Scene Events

Scene hooks fire from the REST API (`/api/v1/scenes`) when scenes are created,
modified, or closed. They are the integration point for AI GM assistants and
other scene-aware plugins.

#### `scene:created`

Fires after a new scene is opened (`POST /api/v1/scenes`).

```typescript
gameHooks.on("scene:created", ({ sceneId, sceneName, roomId, actorId, actorName, sceneType }) => {
  // sceneType — "social" | "action" | "event" | "vignette" | etc.
});
```

#### `scene:pose`

Fires when any pose is posted to a scene — type `"pose"`, `"ooc"`, or `"set"`.

```typescript
gameHooks.on("scene:pose", ({ sceneId, sceneName, roomId, actorId, actorName, msg, type }) => {
  // type — "pose" | "ooc" | "set"
});
```

#### `scene:set`

Fires **additionally** when a pose with `type: "set"` is posted (the scene
description hook). This is the primary integration point for an AI narrator —
it receives the raw description text and can respond with narration, open a new
round, or page participants.

```typescript
gameHooks.on("scene:set", ({ sceneId, sceneName, roomId, actorId, actorName, description }) => {
  // description — the full scene-set text
});
```

#### `scene:title`

Fires when a scene is renamed via `PATCH /api/v1/scenes/:id`.

```typescript
gameHooks.on("scene:title", ({ sceneId, oldName, newName, actorId, actorName }) => {});
```

#### `scene:clear`

Fires when a scene is closed or finished (status transitions to `"closed"`,
`"finished"`, or `"archived"`).

```typescript
gameHooks.on("scene:clear", ({ sceneId, sceneName, actorId, actorName, status }) => {
  // status — "closed" | "finished" | "archived"
});
```
---

## WikiHooks

The wiki plugin exposes its own typed hook bus for reacting to wiki page
mutations. Import it from the wiki plugin's public module:

```typescript
import { wikiHooks } from "../../plugins/wiki/mod.ts";
```

### Events

#### `wiki:created`

```typescript
wikiHooks.on("wiki:created", ({ path, meta, body }) => {
  // path — URL path of the new page, e.g. "news/announcement"
  // meta — frontmatter key/value map
  // body — page body markdown
});
```

#### `wiki:edited`

```typescript
wikiHooks.on("wiki:edited", ({ path, meta, body }) => {});
```

#### `wiki:deleted`

```typescript
wikiHooks.on("wiki:deleted", ({ path, meta }) => {});
```

Same `on/off/emit` API and error-isolation semantics as GameHooks.
---

## EventHooks

The events plugin (calendar/RSVP system) exposes its own typed bus:

```typescript
import { eventHooks } from "../../plugins/events/hooks.ts";

eventHooks.on("event:created",   ({ eventId, name, startTime, createdBy }) => {});
eventHooks.on("event:updated",   ({ eventId, changes }) => {});
eventHooks.on("event:deleted",   ({ eventId }) => {});
eventHooks.on("event:started",   ({ eventId, name }) => {});
eventHooks.on("event:ended",     ({ eventId, name }) => {});
eventHooks.on("event:rsvp",      ({ eventId, playerId, status }) => {});
eventHooks.on("event:cancelled", ({ eventId, name }) => {});
```
---

## EventsService (pub/sub)

For running **sandbox scripts** in response to events, use `EventsService`.
This is different from GameHooks — subscribers are script strings that run
inside Web Workers with full `u.*` SDK access.

```typescript
import { EventsService } from "../../services/Events/index.ts";

const svc = EventsService.getInstance();

// Subscribe a handler script to run when "player.connect" fires.
const subId = await svc.subscribe(
  "player.connect",
  `u.send("Welcome back, " + u.me.name + "!");`,
  actorId,   // DB object that "owns" this subscription
);

// Unsubscribe
await svc.unsubscribe(subId);
```

Always unsubscribe in your plugin's `remove()` — orphaned subscribers
accumulate across reloads.

### Emitting custom events

```typescript
await svc.emit("weather.change", { newWeather: "stormy" });

// With actor context (becomes u.me in subscriber scripts)
await svc.emit("weather.change", { newWeather: "stormy" }, { id: actorId, state: {} });
```

### In-game event scripting

```typescript
// In a sandbox or system script:
const subId = await u.events.on("weather.change", `
  u.send("The weather changed to: " + event.newWeather);
`);

await u.events.emit("weather.change", { newWeather: "rainy" });
```
---

## Naming Conventions

Use dot-separated namespaces for custom events; built-in events use `:`-separated namespaces:

```
player:login          ← built-in GameHook
scene:set             ← built-in GameHook
wiki:created          ← built-in WikiHook
weather.change        ← custom plugin event (EventsService)
my-plugin.item.pickup ← custom plugin event (EventsService)
```
---

## Full Example

A plugin that reacts to scene:set to broadcast a GM narration and also logs
player logins:

```typescript
// src/plugins/gm-assist/index.ts
import type { IPlugin } from "../../@types/IPlugin.ts";
import { gameHooks } from "jsr:@ursamu/ursamu";
import { send } from "../../services/broadcast/index.ts";
import type { SceneSetEvent, SessionEvent } from "jsr:@ursamu/ursamu";

const onSceneSet = async ({ sceneId, sceneName, roomId, description }: SceneSetEvent) => {
  // Narrate the scene to the room in GM voice
  send([roomId], `%ch%cm[GM]%cn ${description}`, {});
  console.log(`[GM] Scene "${sceneName}" set in room ${roomId}`);
};

const onLogin = ({ actorName }: SessionEvent) => {
  console.log(`[GM] ${actorName} logged in.`);
};

const gmPlugin: IPlugin = {
  name: "gm-assist",
  version: "1.0.0",

  init: () => {
    gameHooks.on("scene:set",     onSceneSet);
    gameHooks.on("player:login",  onLogin);
    return true;
  },

  remove: () => {
    gameHooks.off("scene:set",    onSceneSet);
    gameHooks.off("player:login", onLogin);
  },
};

export default gmPlugin;
```
