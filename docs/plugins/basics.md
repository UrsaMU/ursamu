---
layout: layout.vto
description: Learn the basics of UrsaMU plugin development
nav:
  - text: What Are Plugins?
    url: "#what-are-plugins"
  - text: Plugin Interface
    url: "#plugin-interface"
  - text: Plugin Lifecycle
    url: "#plugin-lifecycle"
  - text: Plugin Configuration
    url: "#plugin-configuration"
  - text: Example Plugin
    url: "#example-plugin"
---

# Plugin Basics

## What Are Plugins?

Plugins are modular extensions that add functionality to UrsaMU without modifying the core codebase. They allow you to:

- Add new commands and features
- Modify existing behavior
- Integrate with external services
- Customize the game experience

UrsaMU's plugin system is designed to be flexible and powerful, allowing developers to extend the server in virtually any way while maintaining compatibility with future updates.

## Plugin Interface

All UrsaMU plugins implement the `IPlugin` interface, which defines the structure and required methods for a plugin:

```typescript
interface IPlugin {
  // Required properties
  name: string;         // Unique name of the plugin
  version: string;      // Semantic version (e.g., "1.0.0")
  description: string;  // Brief description of what the plugin does
  author: string;       // Plugin author's name or identifier
  
  // Optional properties
  dependencies?: string[];  // Other plugins this plugin depends on
  config?: Record<string, any>;  // Plugin configuration

  // Required methods
  onInit(app: App): Promise<void> | void;  // Called when the plugin is initialized
  onLoad(app: App): Promise<void> | void;  // Called when the plugin is loaded
  onUnload(app: App): Promise<void> | void;  // Called when the plugin is unloaded
}
```

## Plugin Lifecycle

UrsaMU plugins go through several lifecycle stages:

1. **Registration**: The plugin is registered with the plugin manager
2. **Initialization**: The `onInit` method is called, allowing the plugin to set up resources
3. **Loading**: The `onLoad` method is called, activating the plugin's functionality
4. **Unloading**: The `onUnload` method is called when the plugin is disabled or the server shuts down

### The `onInit` Method

The `onInit` method is called once when the plugin is first initialized. Use this method to:

- Register commands
- Set up database schemas
- Initialize resources
- Register event listeners

```typescript
onInit(app: App): void {
  // Register a new command
  app.commands.register("myplugin", {
    name: "hello",
    pattern: "hello",
    flags: "connected",
    exec: (ctx) => {
      ctx.send("Hello from my plugin!");
    }
  });
}
```

### The `onLoad` Method

The `onLoad` method is called each time the plugin is loaded or reloaded. Use this method to:

- Start services
- Connect to external resources
- Activate functionality

```typescript
onLoad(app: App): void {
  console.log(`${this.name} v${this.version} loaded!`);
  // Start any services or activate functionality
}
```

### The `onUnload` Method

The `onUnload` method is called when the plugin is unloaded or the server shuts down. Use this method to:

- Clean up resources
- Close connections
- Save state

```typescript
onUnload(app: App): void {
  console.log(`${this.name} unloaded`);
  // Clean up resources
}
```

## Plugin Configuration

Plugins can define their own configuration options, which can be set in the server's configuration file:

```json
{
  "plugins": {
    "my-plugin": {
      "option1": "value1",
      "option2": 42
    }
  }
}
```

Access configuration values in your plugin:

```typescript
class MyPlugin implements IPlugin {
  name = "my-plugin";
  version = "1.0.0";
  description = "An example plugin";
  author = "Your Name";
  
  // Default configuration
  config = {
    option1: "default",
    option2: 0
  };
  
  onInit(app: App): void {
    // Access configuration values
    console.log(this.config.option1); // "value1" from config or "default" if not set
    console.log(this.config.option2); // 42 from config or 0 if not set
  }
}
```

## Example Plugin

Here's a complete example of a simple plugin that adds a "hello" command:

```typescript
// src/plugins/hello-world/index.ts
import { App, IPlugin } from "ursamu";

export default class HelloWorldPlugin implements IPlugin {
  name = "hello-world";
  version = "1.0.0";
  description = "A simple hello world plugin";
  author = "Your Name";
  
  config = {
    greeting: "Hello, world!"
  };
  
  onInit(app: App): void {
    // Register the hello command
    app.commands.register("hello-world", {
      name: "hello",
      pattern: "hello",
      flags: "connected",
      exec: (ctx) => {
        ctx.send(this.config.greeting);
      }
    });
    
    console.log(`${this.name} initialized`);
  }
  
  onLoad(app: App): void {
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    console.log(`${this.name} unloaded`);
  }
}
```

To use this plugin, you would:

1. Create the directory `src/plugins/hello-world/`
2. Save the above code as `index.ts` in that directory
3. Add the plugin to your configuration:

```json
{
  "plugins": {
    "hello-world": {
      "greeting": "Hello from my custom plugin!"
    }
  }
}
```

4. Restart your UrsaMU server

Now, when a player types "hello" in the game, they'll see the custom greeting message. 