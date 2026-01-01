---
layout: layout.vto
description: Core API reference for UrsaMU
nav:
  - text: App
    url: "#app"
  - text: Player
    url: "#player"
  - text: GameObject
    url: "#gameobject"
  - text: Command
    url: "#command"
  - text: Hook
    url: "#hook"
  - text: Database
    url: "#database"
---

# UrsaMU Core API Reference

This document provides a reference for the core UrsaMU API classes and interfaces.

## App

The `App` class is the central hub of UrsaMU. It provides access to all the major subsystems and services.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `config` | `Config` | The application configuration |
| `db` | `Database` | The database manager |
| `commands` | `CommandManager` | The command manager |
| `hooks` | `HookManager` | The hook manager |
| `plugins` | `PluginManager` | The plugin manager |
| `players` | `PlayerManager` | The player manager |
| `objects` | `ObjectManager` | The game object manager |
| `flags` | `FlagManager` | The flag manager |
| `channels` | `ChannelManager` | The channel manager |
| `mail` | `MailManager` | The mail manager |
| `bboard` | `BulletinBoardManager` | The bulletin board manager |

### Methods

#### `start()`

Starts the UrsaMU server.

```typescript
app.start();
```

#### `stop()`

Stops the UrsaMU server.

```typescript
app.stop();
```

#### `reload()`

Reloads the UrsaMU server configuration and plugins.

```typescript
app.reload();
```

#### `broadcast(message: string)`

Broadcasts a message to all connected players.

```typescript
app.broadcast("Server is restarting in 5 minutes!");
```

## Player

The `Player` class represents a connected player in the game.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `dbref` | `string` | The database reference ID |
| `name` | `string` | The player's name |
| `password` | `string` | The hashed password |
| `connected` | `boolean` | Whether the player is currently connected |
| `location` | `string` | The dbref of the player's current location |
| `flags` | `string[]` | The flags set on the player |
| `attributes` | `Record<string, any>` | Custom attributes stored on the player |

### Methods

#### `send(message: string)`

Sends a message to the player.

```typescript
player.send("Welcome to UrsaMU!");
```

#### `move(destination: string | GameObject)`

Moves the player to a new location.

```typescript
// Move by dbref
player.move("#123");

// Move by object reference
const room = app.objects.get("#123");
player.move(room);
```

#### `disconnect(reason?: string)`

Disconnects the player from the server.

```typescript
player.disconnect("Idle timeout");
```

#### `hasFlag(flag: string)`

Checks if the player has a specific flag.

```typescript
if (player.hasFlag("WIZARD")) {
  // Player is a wizard
}
```

#### `setFlag(flag: string)`

Sets a flag on the player.

```typescript
player.setFlag("BUILDER");
```

#### `clearFlag(flag: string)`

Removes a flag from the player.

```typescript
player.clearFlag("GUEST");
```

#### `get(attribute: string, defaultValue?: any)`

Gets an attribute value from the player.

```typescript
const description = player.get("description", "No description set.");
```

#### `set(attribute: string, value: any)`

Sets an attribute value on the player.

```typescript
player.set("description", "A tall figure with a mysterious aura.");
```

## GameObject

The `GameObject` class is the base class for all game objects (rooms, exits, things).

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `dbref` | `string` | The database reference ID |
| `name` | `string` | The object's name |
| `type` | `"ROOM" \| "EXIT" \| "THING" \| "PLAYER"` | The object type |
| `owner` | `string` | The dbref of the object's owner |
| `location` | `string` | The dbref of the object's location |
| `flags` | `string[]` | The flags set on the object |
| `attributes` | `Record<string, any>` | Custom attributes stored on the object |

### Methods

#### `hasFlag(flag: string)`

Checks if the object has a specific flag.

```typescript
if (obj.hasFlag("DARK")) {
  // Object is dark
}
```

#### `setFlag(flag: string)`

Sets a flag on the object.

```typescript
obj.setFlag("LOCKED");
```

#### `clearFlag(flag: string)`

Removes a flag from the object.

```typescript
obj.clearFlag("LOCKED");
```

#### `get(attribute: string, defaultValue?: any)`

Gets an attribute value from the object.

```typescript
const description = obj.get("description", "Nothing special.");
```

#### `set(attribute: string, value: any)`

Sets an attribute value on the object.

```typescript
obj.set("description", "A rusty old key.");
```

#### `save()`

Saves the object to the database.

```typescript
obj.set("description", "A new description");
obj.save();
```

## Command

The `Command` interface defines the structure of a command in UrsaMU.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The name of the command |
| `pattern` | `string` | The pattern to match for this command |
| `flags` | `string` | The flags required to use this command |
| `exec` | `(ctx: CommandContext) => void \| Promise<void>` | The function to execute when the command is run |
| `help` | `string` | The help text for the command |

### CommandContext

The `CommandContext` interface provides context for command execution.

| Property | Type | Description |
|----------|------|-------------|
| `player` | `Player` | The player who executed the command |
| `command` | `string` | The full command string |
| `args` | `string` | The arguments passed to the command |
| `switches` | `Record<string, string>` | Any switches used with the command |
| `app` | `App` | The application instance |

#### `send(message: string)`

Sends a message to the player who executed the command.

```typescript
ctx.send("Command executed successfully!");
```

### Example

```typescript
// Define a command
const lookCommand = {
  name: "look",
  pattern: "look *",
  flags: "connected",
  exec: (ctx) => {
    const target = ctx.args.trim() || ctx.player.location;
    // Implementation of look command
    ctx.send(`You look at ${target}`);
  },
  help: "look [<object>]\nLooks at an object or the current room."
};

// Register the command
app.commands.register("core", lookCommand);
```

## Hook

The `HookManager` class manages event hooks in UrsaMU.

### Methods

#### `on(event: string, callback: Function, priority?: number)`

Registers a callback for an event.

```typescript
app.hooks.on("player:connect", (player) => {
  console.log(`Player ${player.name} connected`);
}, 50);
```

#### `off(event: string, callback: Function)`

Removes a callback for an event.

```typescript
app.hooks.off("player:connect", myCallback);
```

#### `emit(event: string, ...args: any[])`

Emits an event with arguments.

```typescript
app.hooks.emit("custom:event", { data: "some data" });
```

#### `once(event: string, callback: Function, priority?: number)`

Registers a one-time callback for an event.

```typescript
app.hooks.once("system:startup", () => {
  console.log("Server started");
});
```

## Database

The `Database` class provides access to the UrsaMU database.

### Methods

#### `get(key: string)`

Gets a value from the database.

```typescript
const value = await app.db.get("players:#123");
```

#### `set(key: string, value: any)`

Sets a value in the database.

```typescript
await app.db.set("players:#123", playerData);
```

#### `delete(key: string)`

Deletes a value from the database.

```typescript
await app.db.delete("players:#123");
```

#### `list(prefix: string)`

Lists all keys with a specific prefix.

```typescript
const playerKeys = await app.db.list("players:");
```

#### `transaction(callback: (tx: Transaction) => Promise<void>)`

Performs a transaction.

```typescript
await app.db.transaction(async (tx) => {
  const player = await tx.get("players:#123");
  player.money += 100;
  await tx.set("players:#123", player);
});
```

## CommandManager

The `CommandManager` class manages commands in UrsaMU.

### Methods

#### `register(plugin: string, command: Command)`

Registers a command.

```typescript
app.commands.register("myplugin", {
  name: "hello",
  pattern: "hello",
  flags: "connected",
  exec: (ctx) => {
    ctx.send("Hello, world!");
  }
});
```

#### `unregister(plugin: string, commandName: string)`

Unregisters a command.

```typescript
app.commands.unregister("myplugin", "hello");
```

#### `get(commandName: string)`

Gets a command by name.

```typescript
const command = app.commands.get("look");
```

#### `match(input: string)`

Finds a command that matches the input.

```typescript
const match = app.commands.match("look at sword");
if (match) {
  // Execute the command
  match.command.exec({
    player,
    command: match.command.name,
    args: match.args,
    switches: match.switches,
    app
  });
}
```

## PluginManager

The `PluginManager` class manages plugins in UrsaMU.

### Methods

#### `register(plugin: IPlugin)`

Registers a plugin.

```typescript
app.plugins.register(new MyPlugin());
```

#### `unregister(pluginName: string)`

Unregisters a plugin.

```typescript
app.plugins.unregister("myplugin");
```

#### `get(pluginName: string)`

Gets a plugin by name.

```typescript
const plugin = app.plugins.get("myplugin");
```

#### `loadAll()`

Loads all registered plugins.

```typescript
await app.plugins.loadAll();
```

#### `unloadAll()`

Unloads all registered plugins.

```typescript
await app.plugins.unloadAll();
```

## PlayerManager

The `PlayerManager` class manages players in UrsaMU.

### Methods

#### `create(name: string, password: string)`

Creates a new player.

```typescript
const player = await app.players.create("NewPlayer", "password123");
```

#### `authenticate(name: string, password: string)`

Authenticates a player.

```typescript
const player = await app.players.authenticate("PlayerName", "password123");
if (player) {
  // Authentication successful
}
```

#### `get(dbref: string)`

Gets a player by dbref.

```typescript
const player = app.players.get("#123");
```

#### `getByName(name: string)`

Gets a player by name.

```typescript
const player = app.players.getByName("PlayerName");
```

#### `getConnected()`

Gets all connected players.

```typescript
const connectedPlayers = app.players.getConnected();
```

#### `broadcast(message: string)`

Broadcasts a message to all connected players.

```typescript
app.players.broadcast("Server announcement: We will be upgrading soon!");
```

## ObjectManager

The `ObjectManager` class manages game objects in UrsaMU.

### Methods

#### `create(type: string, name: string, owner: string)`

Creates a new game object.

```typescript
const room = await app.objects.create("ROOM", "Town Square", "#1");
```

#### `get(dbref: string)`

Gets an object by dbref.

```typescript
const obj = app.objects.get("#123");
```

#### `search(query: ObjectQuery)`

Searches for objects matching a query.

```typescript
const results = await app.objects.search({
  type: "ROOM",
  flags: ["DARK"],
  owner: "#1"
});
```

#### `delete(dbref: string)`

Deletes an object.

```typescript
await app.objects.delete("#123");
```

## FlagManager

The `FlagManager` class manages flags in UrsaMU.

### Methods

#### `register(flag: Flag)`

Registers a new flag.

```typescript
app.flags.register({
  name: "INVISIBLE",
  letter: "I",
  type: ["PLAYER", "THING"],
  permission: "wizard"
});
```

#### `unregister(flagName: string)`

Unregisters a flag.

```typescript
app.flags.unregister("INVISIBLE");
```

#### `get(flagName: string)`

Gets a flag by name.

```typescript
const flag = app.flags.get("WIZARD");
```

#### `check(obj: GameObject, flagName: string)`

Checks if an object has a flag.

```typescript
const hasFlag = app.flags.check(player, "WIZARD");
```

## ChannelManager

The `ChannelManager` class manages communication channels in UrsaMU.

### Methods

#### `create(name: string, owner: string, options?: ChannelOptions)`

Creates a new channel.

```typescript
const channel = await app.channels.create("Public", "#1", {
  header: "Public Channel",
  joinable: true,
  leavable: true
});
```

#### `get(name: string)`

Gets a channel by name.

```typescript
const channel = app.channels.get("Public");
```

#### `join(channelName: string, player: Player)`

Adds a player to a channel.

```typescript
await app.channels.join("Public", player);
```

#### `leave(channelName: string, player: Player)`

Removes a player from a channel.

```typescript
await app.channels.leave("Public", player);
```

#### `send(channelName: string, sender: Player, message: string)`

Sends a message to a channel.

```typescript
await app.channels.send("Public", player, "Hello, everyone!");
```

## MailManager

The `MailManager` class manages the mail system in UrsaMU.

### Methods

#### `send(sender: string, recipient: string, subject: string, body: string)`

Sends a mail message.

```typescript
await app.mail.send("#1", "#2", "Hello", "This is a test message.");
```

#### `get(mailId: string)`

Gets a mail message by ID.

```typescript
const message = await app.mail.get("mail:123");
```

#### `getInbox(player: string)`

Gets a player's inbox.

```typescript
const inbox = await app.mail.getInbox("#1");
```

#### `delete(mailId: string)`

Deletes a mail message.

```typescript
await app.mail.delete("mail:123");
```

## BulletinBoardManager

The `BulletinBoardManager` class manages bulletin boards in UrsaMU.

### Methods

#### `createBoard(name: string, owner: string, options?: BoardOptions)`

Creates a new bulletin board.

```typescript
const board = await app.bboard.createBoard("Announcements", "#1", {
  readPermission: "connected",
  writePermission: "wizard"
});
```

#### `getBoard(name: string)`

Gets a board by name.

```typescript
const board = await app.bboard.getBoard("Announcements");
```

#### `post(boardName: string, author: string, subject: string, body: string)`

Posts a message to a board.

```typescript
await app.bboard.post("Announcements", "#1", "Server Update", "We will be updating the server tomorrow.");
```

#### `getPost(postId: string)`

Gets a post by ID.

```typescript
const post = await app.bboard.getPost("post:123");
```

#### `deletePost(postId: string)`

Deletes a post.

```typescript
await app.bboard.deletePost("post:123");
``` 