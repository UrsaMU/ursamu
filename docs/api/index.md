---
layout: layout.vto
title: API Reference
description: Comprehensive API reference for UrsaMU
nav:
  - text: Core API
    url: "#core-api"
  - text: Database API
    url: "#database-api"
  - text: Command API
    url: "#command-api"
  - text: Flag API
    url: "#flag-api"
  - text: Function API
    url: "#function-api"
  - text: Hook API
    url: "#hook-api"
  - text: Utility API
    url: "#utility-api"
---

# UrsaMU API Reference

This document provides a comprehensive reference for the UrsaMU API.

## Core API

### mu(options)

The main function to initialize and start the UrsaMU engine.

**Parameters:**

- `options` (Object): Configuration options for the UrsaMU engine
  - `config` (Object): Configuration object
  - `plugins` (Array): Array of plugins to load

**Returns:**

- Promise<void>: Resolves when the engine has started

**Example:**

```typescript
import { mu } from "ursamu";

await mu({
  config: {
    server: {
      port: 4201,
      host: "0.0.0.0",
    },
    game: {
      name: "My Game",
    },
  },
  plugins: [myPlugin],
});
```

### app

The global application object that provides access to various services and
utilities.

**Properties:**

- `config`: The configuration manager
- `db`: The database manager
- `commands`: The command manager
- `flags`: The flag manager
- `functions`: The function manager
- `hooks`: The hook manager
- `router`: The web router (if web interface is enabled)

**Example:**

```typescript
import { app } from "ursamu";

// Access the configuration
const gameName = app.config.get("game.name");

// Access the database
const player = await app.db.get("player:123");
```

## Database API

### dbojs

The main database service for game objects.

**Methods:**

#### create(data)

Creates a new object in the database.

**Parameters:**

- `data` (Object): The object data to create

**Returns:**

- Promise<Object>: The created object

**Example:**

```typescript
import { dbojs } from "../../services/Database/index.ts";

const newObject = await dbojs.create({
  flags: "thing",
  data: {
    name: "My Object",
    description: "A custom object",
  },
});
```

#### get(id)

Retrieves an object from the database by ID.

**Parameters:**

- `id` (string): The ID of the object to retrieve

**Returns:**

- Promise<Object|null>: The retrieved object, or null if not found

**Example:**

```typescript
const object = await dbojs.get("123");
```

#### update(object)

Updates an object in the database.

**Parameters:**

- `object` (Object): The object to update

**Returns:**

- Promise<Object>: The updated object

**Example:**

```typescript
object.data.description = "Updated description";
await dbojs.update(object);
```

#### delete(id)

Deletes an object from the database.

**Parameters:**

- `id` (string): The ID of the object to delete

**Returns:**

- Promise<void>

**Example:**

```typescript
await dbojs.delete("123");
```

#### query(criteria)

Queries the database for objects matching the given criteria.

**Parameters:**

- `criteria` (Object): Query criteria

**Returns:**

- Promise<Array<Object>>: Array of matching objects

**Example:**

```typescript
// Find all rooms
const rooms = await dbojs.query({ flags: /room/i });

// Find objects owned by a player
const objects = await dbojs.query({ owner: "123" });

// Find a player by name
const players = await dbojs.query({
  "data.name": new RegExp("^PlayerName$", "i"),
  flags: /player/i,
});
```

#### all()

Retrieves all objects from the database.

**Returns:**

- Promise<Array<Object>>: Array of all objects

**Example:**

```typescript
const allObjects = await dbojs.all();
```

### counters

The database service for counters.

**Methods:**

Similar to `dbojs`, with the same method signatures.

### chans

The database service for communication channels.

**Methods:**

Similar to `dbojs`, with the same method signatures.

### mail

The database service for the mail system.

**Methods:**

Similar to `dbojs`, with the same method signatures.

### bboard

The database service for bulletin boards.

**Methods:**

Similar to `dbojs`, with the same method signatures.

## Command API

### addCmd(command)

Registers a new command.

**Parameters:**

- `command` (ICmd): The command to register
  - `name` (string): Unique identifier for the command
  - `pattern` (string | RegExp): Regex pattern to match user input; capture groups become `u.cmd.args`
  - `lock` (string): Lock expression required to use the command (e.g. `"connected"`, `"wizard"`)
  - `exec` (Function): Function to execute — receives `IUrsamuSDK`

**Returns:**

- void

**Example:**

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

addCmd({
  name: "hello",
  pattern: /^hello\s*(.*)/i,
  lock: "connected",
  exec: (u: IUrsamuSDK) => {
    const target = u.cmd.args[0]?.trim() || "World";
    u.send(`Hello, ${target}!`);
  },
});
```

### IUrsamuSDK

The unified SDK object passed to every command's `exec` function. The same object is available in sandbox scripts.

**Key properties:**

| Property | Type | Description |
|----------|------|-------------|
| `u.me` | `IDBObj` | The actor who executed the command |
| `u.here` | `IDBObj \| null` | The room the actor is in |
| `u.cmd.args` | `string[]` | Regex capture groups from the matched pattern |
| `u.cmd.switches` | `string[]` | Switches supplied to the command |
| `u.socketId` | `string` | The WebSocket socket ID |

**Key methods:**

| Method | Description |
|--------|-------------|
| `u.send(msg)` | Send output to the actor |
| `u.broadcast(roomId, msg)` | Broadcast to everyone in a room |
| `u.force(cmd)` | Execute a command string as the actor |
| `u.setFlags(id, flags)` | Add/remove flags (`"+wizard"`, `"-dark"`) |
| `u.teleport(id, destination)` | Move an object to a destination |
| `u.canEdit(actor, target)` | Check if actor can edit target (async) |
| `u.db.search(query)` | Search the database |
| `u.db.create(data)` | Create a new object |
| `u.db.modify(id, data)` | Update an object |
| `u.db.destroy(id)` | Delete an object |
| `u.util.target(actor, name)` | Find a named object (async) |
| `u.util.stripSubs(str)` | Strip MUSH color/substitution codes |
| `u.auth.hash(password)` | Hash a password |
| `u.sys.disconnect(socketId)` | Disconnect a socket |
| `u.sys.reboot()` | Reboot the server |

**Example:**

```typescript
exec: async (u: IUrsamuSDK) => {
  // Access the actor
  const actorName = String(u.me.state.name ?? u.me.id);

  // Access command arguments
  const target = u.cmd.args[0]?.trim() ?? "";

  // Check switches
  const isVerbose = u.cmd.switches?.includes("verbose");

  // Send output to the actor
  u.send(`Hello, ${actorName}!`);
};
```

## Flag API

### registerFlag(flag)

Registers a new flag.

**Parameters:**

- `flag` (Object): The flag to register
  - `name` (string): Name of the flag
  - `description` (string): Description of what the flag does
  - `default` (boolean): Default value for new objects

**Returns:**

- void

**Example:**

```typescript
import { registerFlag } from "../../services/Flags/mod.ts";

registerFlag({
  name: "vip",
  description: "VIP player with special privileges",
  default: false,
});
```

### hasFlag(object, flag)

Checks if an object has a flag.

**Parameters:**

- `object` (Object): The object to check
- `flag` (string): The flag to check for

**Returns:**

- boolean: True if the object has the flag, false otherwise

**Example:**

```typescript
import { hasFlag } from "../../services/Flags/mod.ts";

if (hasFlag(player, "wizard")) {
  // Player is a wizard
}
```

### setFlag(object, flag, value)

Sets a flag on an object.

**Parameters:**

- `object` (Object): The object to modify
- `flag` (string): The flag to set
- `value` (boolean): The value to set (true to add, false to remove)

**Returns:**

- Promise<Object>: The updated object

**Example:**

```typescript
import { setFlag } from "../../services/Flags/mod.ts";

// Add the "vip" flag to a player
await setFlag(player, "vip", true);

// Remove the "vip" flag from a player
await setFlag(player, "vip", false);
```

## Function API

### registerFunction(func)

Registers a new function for use in expressions.

**Parameters:**

- `func` (Object): The function to register
  - `name` (string): Name of the function
  - `description` (string): Description of what the function does
  - `args` (Array<string>): Array of argument names
  - `exec` (Function): Function to execute

**Returns:**

- void

**Example:**

```typescript
import { registerFunction } from "../../services/Functions/mod.ts";

registerFunction({
  name: "add",
  description: "Adds two numbers",
  args: ["num1", "num2"],
  exec: (args) => {
    const [num1, num2] = args.map(Number);
    return (num1 + num2).toString();
  },
});
```

## Hook API

### GameHooks

`gameHooks` is the typed engine-level event bus exported from `jsr:@ursamu/ursamu`.
It fires for 12 built-in events across players, scenes, and channels.

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";

gameHooks.on(event, handler)    // subscribe (idempotent — no double-register)
gameHooks.off(event, handler)   // unsubscribe
await gameHooks.emit(event, payload)  // fire all handlers; errors caught per-handler
```

**Fire-and-forget pattern:**

```typescript
gameHooks.emit("player:login", payload)
  .catch((e) => console.error("[hooks] error:", e));
```

#### Built-in events

| Event | Payload type | When |
|-------|-------------|------|
| `player:say` | `SayEvent` | Player speaks in a room |
| `player:pose` | `PoseEvent` | Player poses/emotes |
| `player:page` | `PageEvent` | Player pages another |
| `player:move` | `MoveEvent` | Player traverses an exit |
| `player:login` | `SessionEvent` | Player connects and logs in |
| `player:logout` | `SessionEvent` | Player disconnects |
| `channel:message` | `ChannelMessageEvent` | Player speaks on a channel |
| `scene:created` | `SceneCreatedEvent` | New scene opened |
| `scene:pose` | `ScenePoseEvent` | Any pose posted to a scene |
| `scene:set` | `SceneSetEvent` | Scene-set description posted |
| `scene:title` | `SceneTitleEvent` | Scene renamed |
| `scene:clear` | `SceneClearEvent` | Scene closed/finished/archived |

#### Payload types (exported from `jsr:@ursamu/ursamu`)

```typescript
SayEvent          { actorId, actorName, roomId, message }
PoseEvent         { actorId, actorName, roomId, content, isSemipose }
PageEvent         { actorId, actorName, targetId, targetName, message }
MoveEvent         { actorId, actorName, fromRoomId, toRoomId, fromRoomName, toRoomName, exitName }
SessionEvent      { actorId, actorName }
ChannelMessageEvent { channelName, senderId, senderName, message }
SceneCreatedEvent { sceneId, sceneName, roomId, actorId, actorName, sceneType }
ScenePoseEvent    { sceneId, sceneName, roomId, actorId, actorName, msg, type }
SceneSetEvent     { sceneId, sceneName, roomId, actorId, actorName, description }
SceneTitleEvent   { sceneId, oldName, newName, actorId, actorName }
SceneClearEvent   { sceneId, sceneName, actorId, actorName, status }
```

#### Example

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";
import type { SceneSetEvent } from "jsr:@ursamu/ursamu";

const onSet = ({ roomId, description }: SceneSetEvent) => {
  console.log(`Scene set in room ${roomId}: ${description}`);
};

gameHooks.on("scene:set", onSet);
// Later, in plugin remove():
gameHooks.off("scene:set", onSet);
```

### WikiHooks

Typed hook bus for wiki page mutations (from `src/plugins/wiki/mod.ts`):

```typescript
import { wikiHooks } from "../../plugins/wiki/mod.ts";

wikiHooks.on("wiki:created", ({ path, meta, body }) => {});
wikiHooks.on("wiki:edited",  ({ path, meta, body }) => {});
wikiHooks.on("wiki:deleted", ({ path, meta })       => {});
```

### EventHooks

Typed hook bus for the events plugin (from `src/plugins/events/hooks.ts`):

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

### Wiki REST API

The wiki plugin mounts a REST API at `/api/v1/wiki`. All write operations
require `admin`, `wizard`, or `superuser` flags.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/wiki` | Required | List all pages (title, path) |
| `GET` | `/api/v1/wiki?q=<query>` | Required | Full-text search (title, body, tags) |
| `GET` | `/api/v1/wiki/<path>` | Required | Read page (JSON) or directory listing |
| `GET` | `/api/v1/wiki/<path.ext>` | Required | Serve static asset (image, PDF) |
| `POST` | `/api/v1/wiki` | Staff | Create a page |
| `PATCH` | `/api/v1/wiki/<path>` | Staff | Update body and/or frontmatter |
| `DELETE` | `/api/v1/wiki/<path>` | Staff | Delete page or static asset |
| `PUT` | `/api/v1/wiki/<path.ext>` | Staff | Upload static asset (binary) |

**GET page response shape:**

```json
{
  "path": "news/patch-notes",
  "title": "Patch Notes",
  "date": "2026-03-18",
  "author": "Admin",
  "tags": ["news"],
  "body": "## Changes\n..."
}
```

**POST / PATCH request body:**

```json
{
  "path": "news/patch-notes",
  "title": "Patch Notes",
  "body": "## Changes\n..."
}
```

Any extra fields beyond `path` and `body` become frontmatter. Keys must
match `/^[\w-]+$/`. Max body size: **10 MB**.

## Utility API

### parseFlags(flags)

Parses a flag string into an array of flags.

**Parameters:**

- `flags` (string): The flag string to parse

**Returns:**

- Array<string>: Array of parsed flags

**Example:**

```typescript
import { parseFlags } from "../../utils/flags.ts";

const flags = parseFlags("wizard builder connected");
// Returns: ["wizard", "builder", "connected"]
```

### formatText(text, data)

Formats text with substitutions.

**Parameters:**

- `text` (string): The text to format
- `data` (Object): Data for substitutions

**Returns:**

- string: The formatted text

**Example:**

```typescript
import { formatText } from "../../utils/text.ts";

const formatted = formatText("Hello, %{name}!", { name: "World" });
// Returns: "Hello, World!"
```

### parseArgs(input)

Parses command input into command, arguments, and switches.

**Parameters:**

- `input` (string): The input to parse

**Returns:**

- Object: The parsed input
  - `cmd` (string): The command
  - `args` (string): The arguments
  - `switches` (Object): The switches

**Example:**

```typescript
import { parseArgs } from "../../utils/args.ts";

const parsed = parseArgs("look/verbose at box");
// Returns: { cmd: "look", args: "at box", switches: { verbose: true } }
```

### match(pattern, input)

Checks if input matches a command pattern.

**Parameters:**

- `pattern` (string): The pattern to match against
- `input` (string): The input to check

**Returns:**

- boolean: True if the input matches the pattern, false otherwise

**Example:**

```typescript
import { match } from "../../utils/match.ts";

const isMatch = match("look *", "look at box");
// Returns: true
```

### evaluateExpression(expression, context)

Evaluates an expression.

**Parameters:**

- `expression` (string): The expression to evaluate
- `context` (Object): The context for evaluation

**Returns:**

- Promise<string>: The result of the evaluation

**Example:**

```typescript
import { evaluateExpression } from "../../utils/expressions.ts";

const result = await evaluateExpression("add(5, 3)", { player });
// Returns: "8"
```

### sanitize(text)

Sanitizes text for safe display.

**Parameters:**

- `text` (string): The text to sanitize

**Returns:**

- string: The sanitized text

**Example:**

```typescript
import { sanitize } from "../../utils/text.ts";

const safe = sanitize("<script>alert('XSS')</script>");
// Returns: "&lt;script&gt;alert('XSS')&lt;/script&gt;"
```

### colorize(text)

Converts color codes in text to ANSI color codes.

**Parameters:**

- `text` (string): The text to colorize

**Returns:**

- string: The colorized text

**Example:**

```typescript
import { colorize } from "../../utils/colors.ts";

const colored = colorize("%chHello, %cgWorld!%cn");
// Returns text with ANSI color codes
```

### stripColors(text)

Removes color codes from text.

**Parameters:**

- `text` (string): The text to strip colors from

**Returns:**

- string: The text without color codes

**Example:**

```typescript
import { stripColors } from "../../utils/colors.ts";

const plain = stripColors("%chHello, %cgWorld!%cn");
// Returns: "Hello, World!"
```

### generateId()

Generates a unique ID.

**Returns:**

- string: A unique ID

**Example:**

```typescript
import { generateId } from "../../utils/id.ts";

const id = generateId();
// Returns something like: "a1b2c3d4"
```

### hash(text)

Creates a hash of the given text.

**Parameters:**

- `text` (string): The text to hash

**Returns:**

- Promise<string>: The hashed text

**Example:**

```typescript
import { hash } from "../../utils/hash.ts";

const hashed = await hash("password");
// Returns a bcrypt hash
```

### compareHash(text, hash)

Compares text with a hash.

**Parameters:**

- `text` (string): The text to compare
- `hash` (string): The hash to compare against

**Returns:**

- Promise<boolean>: True if the text matches the hash, false otherwise

**Example:**

```typescript
import { compareHash } from "../../utils/hash.ts";

const isMatch = await compareHash("password", hashedPassword);
// Returns: true or false
```

This API reference covers the main functionality of UrsaMU. For more detailed
information on specific functions or classes, refer to the source code or the
relevant documentation sections.
