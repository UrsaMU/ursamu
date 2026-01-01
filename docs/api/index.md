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

### registerCommand(command)

Registers a new command.

**Parameters:**

- `command` (Object): The command to register
  - `name` (string): Unique identifier for the command
  - `pattern` (string): Pattern to match user input
  - `flags` (string): Flags required to use the command
  - `exec` (Function): Function to execute when command is triggered

**Returns:**

- void

**Example:**

```typescript
import { registerCommand } from "../../services/Commands/mod.ts";

registerCommand({
  name: "hello",
  pattern: "hello *",
  flags: "connected",
  exec: (ctx) => {
    const target = ctx.args.trim() || "World";
    ctx.send(`Hello, ${target}!`);
  },
});
```

### registerMiddleware(middleware)

Registers middleware to process commands.

**Parameters:**

- `middleware` (Function): The middleware function

**Returns:**

- void

**Example:**

```typescript
import { registerMiddleware } from "../../services/Commands/mod.ts";

registerMiddleware(async (ctx, next) => {
  console.log(`Command executed: ${ctx.cmd}`);
  await next();
});
```

### Command Context

The context object passed to command execution functions.

**Properties:**

- `player` (Object): The player who triggered the command
- `cmd` (string): The command that was triggered
- `args` (string): The arguments passed to the command
- `switches` (Object): Any switches used with the command
- `send` (Function): Function to send output to the player

**Example:**

```typescript
exec: ((ctx) => {
  // Access the player
  const playerName = ctx.player.data.name;

  // Access command arguments
  const args = ctx.args.trim();

  // Access switches
  const verbose = ctx.switches.verbose;

  // Send output to the player
  ctx.send(`Hello, ${playerName}!`);
});
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

### registerHook(hookName, callback)

Registers a hook to be called at a specific point in the system's execution.

**Parameters:**

- `hookName` (string): The name of the hook point
- `callback` (Function): The function to call when the hook is triggered

**Returns:**

- void

**Example:**

```typescript
import { registerHook } from "../../services/Hooks/mod.ts";

registerHook("playerConnect", async (player) => {
  console.log(`Player ${player.data.name} connected`);
});
```

### registerHookPoint(hookName)

Registers a new hook point.

**Parameters:**

- `hookName` (string): The name of the hook point to register

**Returns:**

- void

**Example:**

```typescript
import { registerHookPoint } from "../../services/Hooks/mod.ts";

registerHookPoint("myCustomHook");
```

### triggerHook(hookName, ...args)

Triggers a hook, calling all registered callbacks.

**Parameters:**

- `hookName` (string): The name of the hook point to trigger
- `...args` (any): Arguments to pass to the hook callbacks

**Returns:**

- Promise<void>

**Example:**

```typescript
import { triggerHook } from "../../services/Hooks/mod.ts";

await triggerHook("myCustomHook", { data: "some data" });
```

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
