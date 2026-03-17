---
layout: layout.vto
description: Reacting to and emitting game events with EventsService
nav:
  - text: Overview
    url: "#overview"
  - text: Subscribing to Events
    url: "#subscribing-to-events"
  - text: Emitting Events
    url: "#emitting-events"
  - text: In-Game Event Subscriptions
    url: "#in-game-event-subscriptions"
  - text: Naming Conventions
    url: "#naming-conventions"
  - text: Full Example
    url: "#full-example"
---

# Plugin Events

## Overview

UrsaMU uses an internal pub/sub system via `EventsService`. Plugins can
subscribe to named event channels, emit custom events, and trigger sandbox
scripts when events fire. This is the correct way to react to things that
happen in the game world — there is no `app.hooks` API.

---

## Subscribing to Events

```typescript
import { EventsService } from "../../services/Events/index.ts";

const svc = EventsService.getInstance();

// Subscribe a handler script to run when "player.connect" fires.
// Returns a subscription UUID — store it so you can unsubscribe later.
const subId = await svc.subscribe(
  "player.connect",         // event name
  `u.send("Welcome back, " + u.me.name + "!");`,  // sandbox script
  actorId,                  // the DB object that "owns" this subscription
);
```

The script string is run in the sandbox with full `u.*` SDK access. The
`actorId` is the DB object the script runs as (typically the player or a
world object).

### Unsubscribing

```typescript
await svc.unsubscribe(subId);
```

Always unsubscribe in your plugin's `remove()` if you subscribed during
`init()` — otherwise orphaned subscribers accumulate across reloads.

```typescript
let connectSubId: string;

const myPlugin: IPlugin = {
  name: "welcome",
  version: "1.0.0",

  init: async () => {
    const svc = EventsService.getInstance();
    connectSubId = await svc.subscribe(
      "player.connect",
      `u.send("%ch%cgWelcome back, " + u.me.name + "!%cn");`,
      "world",   // run as the world object
    );
    return true;
  },

  remove: async () => {
    const svc = EventsService.getInstance();
    await svc.unsubscribe(connectSubId);
  },
};
```

---

## Emitting Events

Emit any named event from plugin code. All active subscribers for that event
will receive it:

```typescript
import { EventsService } from "../../services/Events/index.ts";

const svc = EventsService.getInstance();

// Emit with optional payload data and actor context
await svc.emit("weather.change", { newWeather: "stormy" });

// With an actor context (the actor becomes u.me in subscriber scripts)
await svc.emit(
  "weather.change",
  { newWeather: "stormy" },
  { id: actorId, state: {} },
);
```

---

## In-Game Event Subscriptions

Players and world objects can subscribe to events from inside the game using
`u.events.on()` and fire them with `u.events.emit()` in sandbox scripts:

```typescript
// In a sandbox script or system script:
const subId = await u.events.on("weather.change", `
  u.send("The weather changed to: " + event.newWeather);
`);

await u.events.emit("weather.change", { newWeather: "rainy" });
```

This makes the events system available to in-game scripting without exposing
server internals.

---

## Naming Conventions

Use dot-separated namespaces to avoid collisions:

```
player.connect          ← core engine event
player.disconnect       ← core engine event
weather.change          ← weather plugin event
my-plugin.item.pickup   ← custom plugin event
```

Prefix your plugin's events with its name. Core events use bare namespaces
(`player.*`, `room.*`, etc.).

---

## Full Example

A weather plugin that broadcasts weather changes to all subscribers:

```typescript
// src/plugins/weather/index.ts
import type { IPlugin } from "../../@types/IPlugin.ts";
import { EventsService } from "../../services/Events/index.ts";
import "./commands.ts";

const WEATHER_TYPES = ["sunny", "cloudy", "rainy", "stormy", "snowy"] as const;
let weatherInterval: number | undefined;

const weatherPlugin: IPlugin = {
  name: "weather",
  version: "1.0.0",
  description: "Rotating weather system with event hooks",

  init: async () => {
    let current: string = "sunny";

    weatherInterval = setInterval(async () => {
      const options = WEATHER_TYPES.filter(w => w !== current);
      current = options[Math.floor(Math.random() * options.length)];

      const svc = EventsService.getInstance();
      await svc.emit("weather.change", { weather: current });
    }, 30 * 60 * 1000) as unknown as number;   // every 30 min

    console.log("[weather] initialized — weather cycle started");
    return true;
  },

  remove: async () => {
    if (weatherInterval !== undefined) clearInterval(weatherInterval);
    console.log("[weather] removed");
  },
};

export default weatherPlugin;
```

```typescript
// src/plugins/weather/commands.ts
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { EventsService } from "../../services/Events/index.ts";

addCmd({
  name: "+weather",
  pattern: /^\+weather(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] || "").toLowerCase();

    if (sw === "watch") {
      // Subscribe this player to weather changes
      const svc = EventsService.getInstance();
      const subId = await svc.subscribe(
        "weather.change",
        `u.send("%ch%cyWeather report:%cn The weather is now " + event.weather + ".");`,
        u.me.id,
      );
      u.send(`%ch+weather:%cn You will now receive weather updates. (sub: ${subId.slice(-6)})`);
      return;
    }

    u.send("Usage: +weather/watch  — subscribe to weather updates");
  },
});
```

Any other plugin can now react to weather changes:

```typescript
// In another plugin's init():
const svc = EventsService.getInstance();
await svc.subscribe(
  "weather.change",
  `if (event.weather === "stormy") u.broadcast("Thunder rumbles in the distance!");`,
  "world",
);
```
