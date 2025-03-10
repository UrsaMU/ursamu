---
layout: layout.njk
description: Learn how to create plugins to extend UrsaMU
nav:
  - text: Plugin Basics
    url: "#plugin-basics"
  - text: Plugin Interface
    url: "#plugin-interface"
  - text: Plugin Structure
    url: "#plugin-structure"
  - text: Plugin Configuration
    url: "#plugin-configuration"
  - text: Plugin Lifecycle
    url: "#plugin-lifecycle"
  - text: Examples
    url: "#examples"
---

# UrsaMU Plugin Development

This section covers how to develop plugins for UrsaMU, allowing you to extend and customize the server with new functionality.

## Plugin Basics

Plugins are modular extensions that add functionality to UrsaMU without modifying the core codebase. They allow you to:

- Add new commands and features
- Modify existing behavior
- Integrate with external services
- Customize the game experience

UrsaMU's plugin system is designed to be lightweight and straightforward, making it easy to create and share plugins.

## Plugin Interface

All UrsaMU plugins implement the `IPlugin` interface, which defines the structure and required methods for a plugin:

```typescript
export interface IPlugin {
  name: string;                // Required: Unique name of the plugin
  description?: string;        // Optional: Description of what the plugin does
  version: string;             // Required: Semantic version (e.g., "1.0.0")
  config?: IConfig;            // Optional: Plugin configuration
  init?: () => boolean | Promise<boolean>;  // Optional: Initialization method
  remove?: () => void | Promise<void>;      // Optional: Cleanup method
}
```

## Plugin Structure

A UrsaMU plugin is a TypeScript module that exports a default object implementing the `IPlugin` interface. Plugins should be placed in the `src/plugins/` directory, with each plugin in its own subdirectory:

```
src/plugins/
├── my-plugin/
│   └── index.ts       # Main plugin file
├── another-plugin/
│   └── index.ts
└── ...
```

Here's a minimal example of a plugin:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";

const myPlugin: IPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  description: "A simple UrsaMU plugin",
  
  init: async () => {
    console.log("My plugin initialized!");
    return true;
  },
  
  remove: async () => {
    console.log("My plugin removed!");
  }
};

export default myPlugin;
```

## Plugin Configuration

Plugins can define their own configuration options in the `config` property. The configuration follows this structure:

```typescript
config: {
  plugins: {
    "plugin-name": {
      // Plugin-specific configuration options
      option1: "value1",
      option2: 42,
      // Nested configuration is supported
      features: {
        feature1: true,
        feature2: false
      }
    }
  }
}
```

To access configuration values in your plugin, use the `getConfig` function:

```typescript
import { getConfig } from "../../services/Config/mod.ts";

// Get a configuration value with type safety
const option1 = getConfig<string>("plugins.my-plugin.option1");
const option2 = getConfig<number>("plugins.my-plugin.option2");
const feature1Enabled = getConfig<boolean>("plugins.my-plugin.features.feature1");
```

## Plugin Lifecycle

UrsaMU plugins have a simple lifecycle:

1. **Loading**: The plugin is loaded from the filesystem
2. **Registration**: The plugin is registered with the configuration system
3. **Initialization**: The `init` method is called (if defined)
4. **Removal**: The `remove` method is called (if defined) when the plugin is unloaded

The `init` method should return `true` for successful initialization or `false` if initialization failed. This allows the system to know whether the plugin was successfully initialized.

## Examples

### Basic Plugin

A simple plugin that just logs messages during initialization and removal:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";

const basicPlugin: IPlugin = {
  name: "basic-plugin",
  version: "1.0.0",
  description: "A basic plugin example",
  
  init: async () => {
    console.log("Basic plugin initialized!");
    return true;
  },
  
  remove: async () => {
    console.log("Basic plugin removed!");
  }
};

export default basicPlugin;
```

### Configuration Plugin

A plugin that uses configuration options:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { getConfig } from "../../services/Config/mod.ts";

const configPlugin: IPlugin = {
  name: "config-plugin",
  version: "1.0.0",
  description: "A plugin that demonstrates configuration",
  
  config: {
    plugins: {
      "config-plugin": {
        enabled: true,
        message: "Hello from the config plugin!",
        options: {
          option1: "value1",
          option2: 42
        }
      }
    }
  },
  
  init: async () => {
    const enabled = getConfig<boolean>("plugins.config-plugin.enabled");
    
    if (enabled) {
      const message = getConfig<string>("plugins.config-plugin.message");
      console.log(message);
      
      const option1 = getConfig<string>("plugins.config-plugin.options.option1");
      const option2 = getConfig<number>("plugins.config-plugin.options.option2");
      
      console.log(`Options: ${option1}, ${option2}`);
    } else {
      console.log("Config plugin is disabled");
    }
    
    return true;
  }
};

export default configPlugin;
```

### Command Plugin

A plugin that adds a custom command:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { registerCommand } from "../../services/Commands/mod.ts";

const commandPlugin: IPlugin = {
  name: "command-plugin",
  version: "1.0.0",
  description: "A plugin that adds a custom command",
  
  init: async () => {
    // Register a custom command
    registerCommand({
      name: "hello",
      pattern: "hello *",
      flags: "connected",
      exec: (ctx) => {
        const target = ctx.args.trim() || "world";
        ctx.send(`Hello, ${target}!`);
      }
    });
    
    return true;
  }
};

export default commandPlugin;
```

### Database Plugin

A plugin that interacts with the database:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { dbojs } from "../../services/Database/index.ts";

const databasePlugin: IPlugin = {
  name: "database-plugin",
  version: "1.0.0",
  description: "A plugin that interacts with the database",
  
  init: async () => {
    // Create a custom object
    const customObject = {
      flags: "thing",
      data: {
        name: "Custom Object",
        description: "An object created by a plugin"
      }
    };
    
    try {
      const obj = await dbojs.create(customObject);
      console.log(`Created custom object with ID: ${obj.id}`);
    } catch (error) {
      console.error("Error creating custom object:", error);
      return false;
    }
    
    return true;
  },
  
  remove: async () => {
    // Clean up by removing objects created by this plugin
    try {
      const objects = await dbojs.query({
        "data.name": "Custom Object"
      });
      
      for (const obj of objects) {
        await dbojs.delete(obj.id);
        console.log(`Deleted custom object with ID: ${obj.id}`);
      }
    } catch (error) {
      console.error("Error cleaning up custom objects:", error);
    }
  }
};

export default databasePlugin;
```

## Using Plugins in a Child Game

When creating a child game using UrsaMU as a library, you can provide custom plugins through the `mu` function:

```typescript
import { mu } from "ursamu";
import myCustomPlugin from "./plugins/my-custom-plugin.ts";

// Initialize UrsaMU with custom plugins
const game = await mu(
  {
    // Custom configuration
    server: {
      telnet: 4201,
      ws: 4202,
      http: 4203
    },
    game: {
      name: "My Custom Game"
    }
  },
  [
    // Custom plugins
    myCustomPlugin
  ],
  {
    // Options
    loadDefaultCommands: true,
    loadDefaultTextFiles: true
  }
);
```

## Best Practices

1. **Unique Names**: Ensure your plugin has a unique name to avoid conflicts
2. **Proper Versioning**: Use semantic versioning for your plugin (MAJOR.MINOR.PATCH)
3. **Configuration Namespacing**: Keep your configuration under your plugin's name
4. **Error Handling**: Properly handle errors in your `init` and `remove` methods
5. **Cleanup**: Always clean up resources in the `remove` method
6. **Documentation**: Document your plugin's purpose, configuration options, and usage 