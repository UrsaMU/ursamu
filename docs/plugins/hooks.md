---
layout: layout.njk
description: Learn how to use hooks in UrsaMU plugins to respond to events
nav:
  - text: Understanding Hooks
    url: "#understanding-hooks"
  - text: Available Hooks
    url: "#available-hooks"
  - text: Creating Custom Hooks
    url: "#creating-custom-hooks"
  - text: Best Practices
    url: "#best-practices"
  - text: Examples
    url: "#examples"
---

# Plugin Hooks

Hooks are a powerful feature of UrsaMU's plugin system that allow plugins to respond to events that occur in the game. This guide explains how to use hooks in your plugins.

## Understanding Hooks

Hooks in UrsaMU work on an event-based system. The core server and other plugins emit events at specific points in their execution, and your plugin can register listeners for these events. When an event occurs, all registered listeners are called in the order they were registered.

### Hook Registration

To register a hook in your plugin, use the `app.hooks.on` method in your plugin's `onInit` or `onLoad` method:

```typescript
onInit(app: App): void {
  // Register a hook for the 'player:connect' event
  app.hooks.on('player:connect', (player) => {
    console.log(`Player ${player.name} connected!`);
  });
}
```

### Hook Priorities

You can specify a priority for your hook to control the order in which hooks are executed:

```typescript
// Register a hook with high priority (will run before hooks with lower priority)
app.hooks.on('player:connect', (player) => {
  console.log(`Player ${player.name} connected!`);
}, 100);

// Register a hook with low priority (will run after hooks with higher priority)
app.hooks.on('player:connect', (player) => {
  console.log(`This will run after the high priority hook`);
}, 10);
```

Higher priority values run first. The default priority is 50.

### Async Hooks

Hooks can be asynchronous, allowing you to perform async operations:

```typescript
app.hooks.on('player:connect', async (player) => {
  // Perform some async operation
  await someAsyncFunction();
  console.log(`Player ${player.name} connected!`);
});
```

## Available Hooks

UrsaMU provides many built-in hooks that your plugins can use. Here are the most commonly used hooks:

### Player Hooks

| Hook Name | Description | Parameters |
|-----------|-------------|------------|
| `player:connect` | Fired when a player connects | `player: Player` |
| `player:disconnect` | Fired when a player disconnects | `player: Player` |
| `player:create` | Fired when a new player is created | `player: Player` |
| `player:destroy` | Fired when a player is deleted | `player: Player` |
| `player:command` | Fired when a player enters a command | `player: Player, command: string` |
| `player:look` | Fired when a player looks at something | `player: Player, target: GameObject` |

### Room Hooks

| Hook Name | Description | Parameters |
|-----------|-------------|------------|
| `room:enter` | Fired when a player enters a room | `player: Player, room: Room` |
| `room:leave` | Fired when a player leaves a room | `player: Player, room: Room` |
| `room:create` | Fired when a new room is created | `room: Room` |
| `room:destroy` | Fired when a room is deleted | `room: Room` |

### Object Hooks

| Hook Name | Description | Parameters |
|-----------|-------------|------------|
| `object:create` | Fired when a new object is created | `object: GameObject` |
| `object:destroy` | Fired when an object is deleted | `object: GameObject` |
| `object:attribute:set` | Fired when an attribute is set on an object | `object: GameObject, key: string, value: any` |
| `object:attribute:get` | Fired when an attribute is retrieved from an object | `object: GameObject, key: string, value: any` |

### System Hooks

| Hook Name | Description | Parameters |
|-----------|-------------|------------|
| `system:startup` | Fired when the server starts up | None |
| `system:shutdown` | Fired when the server is shutting down | None |
| `system:reload` | Fired when the server is reloaded | None |
| `system:error` | Fired when a system error occurs | `error: Error` |

### Database Hooks

| Hook Name | Description | Parameters |
|-----------|-------------|------------|
| `db:save` | Fired when an object is saved to the database | `object: GameObject` |
| `db:load` | Fired when an object is loaded from the database | `object: GameObject` |

## Creating Custom Hooks

Your plugins can also create and emit custom hooks for other plugins to use. This is a powerful way to make your plugin extensible.

### Emitting Hooks

To emit a custom hook, use the `app.hooks.emit` method:

```typescript
// Emit a custom hook with data
app.hooks.emit('my-plugin:custom-event', { data: 'some data' });
```

### Naming Conventions

When creating custom hooks, it's a good practice to prefix the hook name with your plugin name to avoid conflicts:

```typescript
// Good - prefixed with plugin name
app.hooks.emit('dice-roller:roll-result', { dice: 3, sides: 6, result: 14 });

// Bad - generic name could conflict with other plugins
app.hooks.emit('roll-result', { dice: 3, sides: 6, result: 14 });
```

## Best Practices

### Hook Performance

Hooks are powerful but can impact performance if overused. Follow these guidelines:

1. **Be Selective**: Only register hooks for events your plugin actually needs to respond to.
2. **Keep Handlers Fast**: Hook handlers should execute quickly to avoid slowing down the server.
3. **Use Async Carefully**: Async hooks don't block the server, but they can lead to race conditions if not handled properly.

### Error Handling

Always include error handling in your hook handlers:

```typescript
app.hooks.on('player:connect', (player) => {
  try {
    // Your hook logic here
  } catch (error) {
    console.error(`Error in player:connect hook: ${error.message}`);
  }
});
```

### Cleanup

When your plugin is unloaded, make sure to remove any hooks it registered:

```typescript
onInit(app: App): void {
  // Store a reference to the hook handler
  this.connectHandler = (player) => {
    console.log(`Player ${player.name} connected!`);
  };
  
  // Register the hook
  app.hooks.on('player:connect', this.connectHandler);
}

onUnload(app: App): void {
  // Remove the hook when the plugin is unloaded
  app.hooks.off('player:connect', this.connectHandler);
}
```

## Examples

### Welcome Message Plugin

This plugin sends a welcome message to players when they connect:

```typescript
import { App, IPlugin, Player } from "ursamu";

export default class WelcomePlugin implements IPlugin {
  name = "welcome";
  version = "1.0.0";
  description = "Sends welcome messages to players";
  author = "Your Name";
  
  // Store hook handlers for cleanup
  private connectHandler: (player: Player) => void;
  
  config = {
    message: "Welcome to the game! Type 'help' for assistance."
  };
  
  onInit(app: App): void {
    // Create the connect handler
    this.connectHandler = (player) => {
      // Send the welcome message after a short delay
      setTimeout(() => {
        player.send(`|c${this.config.message}|n`);
      }, 1000);
    };
    
    // Register the hook
    app.hooks.on('player:connect', this.connectHandler);
    
    console.log(`${this.name} initialized`);
  }
  
  onLoad(app: App): void {
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    // Clean up hooks
    app.hooks.off('player:connect', this.connectHandler);
    console.log(`${this.name} unloaded`);
  }
}
```

### Command Logger Plugin

This plugin logs all commands entered by players:

```typescript
import { App, IPlugin, Player } from "ursamu";

export default class CommandLoggerPlugin implements IPlugin {
  name = "command-logger";
  version = "1.0.0";
  description = "Logs all commands entered by players";
  author = "Your Name";
  
  private commandHandler: (player: Player, command: string) => void;
  
  onInit(app: App): void {
    this.commandHandler = (player, command) => {
      // Don't log passwords
      if (command.startsWith("connect") || command.startsWith("create") || command.startsWith("password")) {
        console.log(`${player.name} entered a sensitive command`);
      } else {
        console.log(`${player.name} entered command: ${command}`);
      }
    };
    
    // Register with high priority to ensure it runs before command processing
    app.hooks.on('player:command', this.commandHandler, 100);
    
    console.log(`${this.name} initialized`);
  }
  
  onLoad(app: App): void {
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    app.hooks.off('player:command', this.commandHandler);
    console.log(`${this.name} unloaded`);
  }
}
```

### Custom Hook Example

This plugin creates a custom weather system with hooks that other plugins can use:

```typescript
import { App, IPlugin } from "ursamu";

export default class WeatherPlugin implements IPlugin {
  name = "weather";
  version = "1.0.0";
  description = "Adds a weather system with custom hooks";
  author = "Your Name";
  
  private weatherTypes = ["sunny", "cloudy", "rainy", "stormy", "snowy"];
  private currentWeather = "sunny";
  private weatherInterval: number;
  
  onInit(app: App): void {
    // Register weather command
    app.commands.register("weather", {
      name: "weather",
      pattern: "weather",
      flags: "connected",
      exec: (ctx) => {
        ctx.send(`The current weather is ${this.currentWeather}.`);
      }
    });
    
    console.log(`${this.name} initialized`);
  }
  
  onLoad(app: App): void {
    // Start the weather cycle
    this.startWeatherCycle(app);
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    // Stop the weather cycle
    clearInterval(this.weatherInterval);
    console.log(`${this.name} unloaded`);
  }
  
  startWeatherCycle(app: App): void {
    // Change weather every 30 minutes
    this.weatherInterval = setInterval(() => {
      const oldWeather = this.currentWeather;
      
      // Choose a new weather type
      let newWeather = oldWeather;
      while (newWeather === oldWeather) {
        newWeather = this.weatherTypes[Math.floor(Math.random() * this.weatherTypes.length)];
      }
      
      this.currentWeather = newWeather;
      
      // Emit a custom hook for the weather change
      app.hooks.emit('weather:change', {
        oldWeather,
        newWeather,
        timestamp: new Date()
      });
      
      // Announce the weather change to all players
      app.players.broadcast(`The weather has changed from ${oldWeather} to ${newWeather}.`);
      
    }, 30 * 60 * 1000); // 30 minutes
  }
}
```

Other plugins can then hook into the weather system:

```typescript
// In another plugin
onInit(app: App): void {
  // React to weather changes
  app.hooks.on('weather:change', (data) => {
    console.log(`Weather changed from ${data.oldWeather} to ${data.newWeather}`);
    
    // Do something based on the new weather
    if (data.newWeather === "stormy") {
      app.players.broadcast("Thunder booms in the distance!");
    }
  });
}
```

By using hooks effectively, you can create plugins that interact with each other and with the core server in powerful ways. 