---
layout: layout.njk
description: Learn how to extend UrsaMU with custom functionality
nav:
  - text: Overview
    url: "#overview"
  - text: Extension Points
    url: "#extension-points"
  - text: Custom Commands
    url: "#custom-commands"
  - text: Custom Flags
    url: "#custom-flags"
  - text: Custom Functions
    url: "#custom-functions"
  - text: Custom Hooks
    url: "#custom-hooks"
  - text: Advanced Extensions
    url: "#advanced-extensions"
---

# Extending UrsaMU

This guide explains how to extend UrsaMU with custom functionality beyond what plugins provide.

## Overview

UrsaMU is designed to be highly extensible. While plugins are the primary way to add functionality, there are several other extension points that allow you to customize the system at a deeper level.

Extension points include:

- Custom commands
- Custom flags
- Custom functions
- Custom hooks
- Advanced extensions (middleware, services, etc.)

## Extension Points

### When to Use Extensions vs. Plugins

- **Plugins**: Use plugins for self-contained features that can be enabled or disabled as a unit.
- **Extensions**: Use extensions when you need to modify core behavior or add functionality that integrates deeply with the system.

Extensions are typically implemented within plugins but can also be added directly in a child game.

## Custom Commands

Commands are the primary way players interact with UrsaMU. You can create custom commands to add new functionality.

### Registering Commands

Use the `registerCommand` function to register a new command:

```typescript
import { registerCommand } from "../../services/Commands/mod.ts";

registerCommand({
  name: "mycommand",       // Unique identifier for the command
  pattern: "mycommand *",  // Pattern to match user input
  flags: "connected",      // Flags required to use the command
  exec: (ctx) => {         // Function to execute when command is triggered
    const args = ctx.args.trim();
    ctx.send(`You typed: ${args}`);
  }
});
```

### Command Context

The `ctx` object passed to the `exec` function contains:

- `player`: The player who triggered the command
- `cmd`: The command that was triggered
- `args`: The arguments passed to the command
- `switches`: Any switches used with the command
- `send`: Function to send output to the player

### Command Patterns

Command patterns determine when a command is triggered:

- Exact match: `"look"` - Matches only "look"
- Wildcard: `"look *"` - Matches "look" followed by anything
- Multiple patterns: `"look/l"` - Matches either "look" or "l"
- Regex: `"^l(.*)$"` - Uses a regular expression to match

## Custom Flags

Flags are used to control access to commands and features. You can create custom flags to implement your own permission system.

### Registering Flags

Use the `registerFlag` function to register a new flag:

```typescript
import { registerFlag } from "../../services/Flags/mod.ts";

registerFlag({
  name: "myflag",          // Name of the flag
  description: "My custom flag", // Description of what the flag does
  default: false           // Default value for new objects
});
```

### Checking Flags

Use the `hasFlag` function to check if an object has a flag:

```typescript
import { hasFlag } from "../../services/Flags/mod.ts";

// Check if player has the "myflag" flag
if (hasFlag(player, "myflag")) {
  // Do something
}
```

### Setting Flags

Use the `setFlag` function to set a flag on an object:

```typescript
import { setFlag } from "../../services/Flags/mod.ts";

// Set the "myflag" flag on a player
await setFlag(player, "myflag", true);
```

## Custom Functions

Functions are used in expressions and can be called from commands. You can create custom functions to add new capabilities to the expression system.

### Registering Functions

Use the `registerFunction` function to register a new function:

```typescript
import { registerFunction } from "../../services/Functions/mod.ts";

registerFunction({
  name: "myfunc",          // Name of the function
  description: "My custom function", // Description of what the function does
  args: ["arg1", "?arg2"],  // Arguments (? prefix means optional)
  exec: (args, ctx) => {    // Function to execute
    const [arg1, arg2 = "default"] = args;
    return `${arg1} and ${arg2}`;
  }
});
```

### Using Custom Functions

Once registered, your function can be used in expressions:

```
> think myfunc(hello, world)
hello and world
```

## Custom Hooks

Hooks allow you to run code at specific points in the system's execution. You can create custom hooks to add behavior that runs automatically.

### Registering Hooks

Use the `registerHook` function to register a new hook:

```typescript
import { registerHook } from "../../services/Hooks/mod.ts";

// Register a hook that runs when a player connects
registerHook("playerConnect", async (player) => {
  console.log(`Player ${player.data.name} connected`);
  
  // You can modify the player or perform other actions
  player.data.lastLogin = new Date().toISOString();
  await dbojs.update(player);
});
```

### Available Hook Points

UrsaMU provides several hook points:

- `playerConnect`: Triggered when a player connects
- `playerDisconnect`: Triggered when a player disconnects
- `playerCreate`: Triggered when a player is created
- `commandBefore`: Triggered before a command is executed
- `commandAfter`: Triggered after a command is executed
- `objectCreate`: Triggered when an object is created
- `objectDestroy`: Triggered when an object is destroyed

### Creating Custom Hook Points

You can create your own hook points for plugins to use:

```typescript
import { registerHookPoint, triggerHook } from "../../services/Hooks/mod.ts";

// Register a new hook point
registerHookPoint("myCustomHook");

// Trigger the hook somewhere in your code
await triggerHook("myCustomHook", { data: "some data" });
```

## Advanced Extensions

### Custom Middleware

You can create custom middleware to process commands before they're executed:

```typescript
import { registerMiddleware } from "../../services/Commands/mod.ts";

// Register middleware that logs all commands
registerMiddleware(async (ctx, next) => {
  console.log(`Player ${ctx.player.data.name} executed: ${ctx.cmd} ${ctx.args}`);
  
  // Call the next middleware in the chain
  await next();
  
  console.log("Command execution completed");
});
```

### Custom Services

You can create custom services to provide functionality to other parts of the system:

```typescript
// src/services/MyService/mod.ts
class MyService {
  private data: Map<string, any> = new Map();
  
  constructor() {
    console.log("MyService initialized");
  }
  
  set(key: string, value: any): void {
    this.data.set(key, value);
  }
  
  get(key: string): any {
    return this.data.get(key);
  }
}

// Create a singleton instance
export const myService = new MyService();
```

### Custom Database Models

You can create custom database models to store specialized data:

```typescript
import { dbojs } from "../../services/Database/index.ts";

// Define a type for your model
interface MyModel {
  id: string;
  name: string;
  data: Record<string, any>;
}

// Create functions to work with your model
async function createMyModel(data: Omit<MyModel, "id">): Promise<MyModel> {
  const model = await dbojs.create({
    flags: "mymodel",
    data: {
      name: data.name,
      ...data.data
    }
  });
  
  return {
    id: model.id,
    name: data.name,
    data: data.data
  };
}

async function getMyModels(): Promise<MyModel[]> {
  const models = await dbojs.query({ flags: /mymodel/i });
  
  return models.map(model => ({
    id: model.id,
    name: model.data.name,
    data: { ...model.data }
  }));
}
```

### Custom Web Routes

If you're using the web interface, you can add custom routes:

```typescript
import { app } from "../../app.ts";

// Add a custom API endpoint
app.router.get("/api/custom", (ctx) => {
  ctx.response.body = { message: "Custom API endpoint" };
});

// Add a custom page
app.router.get("/custom", async (ctx) => {
  ctx.response.body = await app.render("custom.html", {
    title: "Custom Page",
    data: { /* your data */ }
  });
});
```

### Example: Complete Extension

Here's an example of a plugin that uses multiple extension points:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { registerCommand } from "../../services/Commands/mod.ts";
import { registerFlag } from "../../services/Flags/mod.ts";
import { registerFunction } from "../../services/Functions/mod.ts";
import { registerHook } from "../../services/Hooks/mod.ts";
import { dbojs } from "../../services/Database/index.ts";

const myExtensionPlugin: IPlugin = {
  name: "my-extension",
  version: "1.0.0",
  description: "A plugin that demonstrates various extension points",
  
  init: async () => {
    // Register a custom flag
    registerFlag({
      name: "vip",
      description: "VIP player with special privileges",
      default: false
    });
    
    // Register a custom function
    registerFunction({
      name: "isvip",
      description: "Check if a player is a VIP",
      args: ["player"],
      exec: async (args, ctx) => {
        const [playerName] = args;
        
        // Find the player
        const players = await dbojs.query({
          "data.name": new RegExp(`^${playerName}$`, "i"),
          flags: /player/i
        });
        
        if (players.length === 0) {
          return "0";
        }
        
        // Check if the player has the VIP flag
        return players[0].flags.includes("vip") ? "1" : "0";
      }
    });
    
    // Register a custom command
    registerCommand({
      name: "vip",
      pattern: "vip *",
      flags: "wizard",
      exec: async (ctx) => {
        const args = ctx.args.trim().split(" ");
        const action = args[0];
        const target = args[1];
        
        if (!action || !target) {
          return ctx.send("Usage: vip add/remove <player>");
        }
        
        // Find the target player
        const players = await dbojs.query({
          "data.name": new RegExp(`^${target}$`, "i"),
          flags: /player/i
        });
        
        if (players.length === 0) {
          return ctx.send(`Player '${target}' not found.`);
        }
        
        const player = players[0];
        
        if (action === "add") {
          // Add the VIP flag
          if (!player.flags.includes("vip")) {
            player.flags.push("vip");
            await dbojs.update(player);
            ctx.send(`Added VIP status to ${player.data.name}.`);
          } else {
            ctx.send(`${player.data.name} is already a VIP.`);
          }
        } else if (action === "remove") {
          // Remove the VIP flag
          if (player.flags.includes("vip")) {
            player.flags = player.flags.filter(f => f !== "vip");
            await dbojs.update(player);
            ctx.send(`Removed VIP status from ${player.data.name}.`);
          } else {
            ctx.send(`${player.data.name} is not a VIP.`);
          }
        } else {
          ctx.send("Usage: vip add/remove <player>");
        }
      }
    });
    
    // Register a hook
    registerHook("playerConnect", async (player) => {
      // Check if the player is a VIP
      if (player.flags.includes("vip")) {
        // Broadcast a message to all connected players
        const connectedPlayers = await dbojs.query({
          flags: /connected/i
        });
        
        for (const p of connectedPlayers) {
          p.send(`VIP player ${player.data.name} has connected!`);
        }
      }
    });
    
    return true;
  },
  
  remove: async () => {
    // Cleanup code here
  }
};

export default myExtensionPlugin;
```

By using these extension points, you can deeply customize UrsaMU to create a unique game experience tailored to your needs. 