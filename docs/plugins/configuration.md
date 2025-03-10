---
layout: layout.njk
description: Learn how to configure UrsaMU plugins and make your plugins configurable
nav:
  - text: Plugin Configuration Basics
    url: "#plugin-configuration-basics"
  - text: Configuration Schema
    url: "#configuration-schema"
  - text: Accessing Configuration
    url: "#accessing-configuration"
  - text: Configuration UI
    url: "#configuration-ui"
  - text: Best Practices
    url: "#best-practices"
  - text: Examples
    url: "#examples"
---

# Plugin Configuration

This guide explains how to configure UrsaMU plugins and how to make your own plugins configurable.

## Plugin Configuration Basics

UrsaMU plugins can define their own configuration options, which can be set in the server's configuration file. This allows server administrators to customize the behavior of plugins without modifying the plugin code.

### Configuration Location

Plugin configurations are stored in the main UrsaMU configuration file (`config/config.json`) under the `plugins` key:

```json
{
  "server": {
    "port": 4201
  },
  "plugins": {
    "my-plugin": {
      "option1": "value1",
      "option2": 42,
      "nestedOption": {
        "subOption1": true,
        "subOption2": "hello"
      }
    },
    "another-plugin": {
      "enabled": true,
      "timeout": 5000
    }
  }
}
```

### Default Configuration

Plugins should always provide default values for their configuration options. This ensures that the plugin will work correctly even if the administrator doesn't specify any configuration.

```typescript
class MyPlugin implements IPlugin {
  name = "my-plugin";
  version = "1.0.0";
  description = "An example plugin";
  author = "Your Name";
  
  // Default configuration
  config = {
    option1: "default",
    option2: 0,
    nestedOption: {
      subOption1: false,
      subOption2: "default"
    }
  };
  
  // ...
}
```

## Configuration Schema

It's a good practice to define a TypeScript interface for your plugin's configuration. This provides type safety and makes it easier to understand what configuration options are available.

```typescript
// Define the configuration interface
interface MyPluginConfig {
  option1: string;
  option2: number;
  nestedOption: {
    subOption1: boolean;
    subOption2: string;
  };
}

class MyPlugin implements IPlugin {
  name = "my-plugin";
  version = "1.0.0";
  description = "An example plugin";
  author = "Your Name";
  
  // Default configuration with type
  config: MyPluginConfig = {
    option1: "default",
    option2: 0,
    nestedOption: {
      subOption1: false,
      subOption2: "default"
    }
  };
  
  // ...
}
```

### Configuration Validation

You can validate the configuration in your plugin's `onInit` method to ensure that all required options are present and have valid values:

```typescript
onInit(app: App): void {
  // Validate configuration
  if (typeof this.config.option1 !== 'string') {
    console.error(`[${this.name}] Configuration error: option1 must be a string`);
    // Set a default value
    this.config.option1 = "default";
  }
  
  if (typeof this.config.option2 !== 'number' || this.config.option2 < 0) {
    console.error(`[${this.name}] Configuration error: option2 must be a non-negative number`);
    // Set a default value
    this.config.option2 = 0;
  }
  
  // Continue with initialization
  // ...
}
```

## Accessing Configuration

### In Your Plugin

You can access your plugin's configuration through the `config` property:

```typescript
onInit(app: App): void {
  // Access configuration values
  const option1 = this.config.option1;
  const option2 = this.config.option2;
  
  console.log(`Plugin configured with option1=${option1}, option2=${option2}`);
  
  // Use configuration values
  if (this.config.nestedOption.subOption1) {
    // Do something if subOption1 is true
  }
}
```

### Dynamic Configuration

You can also create methods to access configuration values dynamically:

```typescript
// Get a configuration value with a default fallback
getConfig<T>(key: string, defaultValue: T): T {
  const keys = key.split('.');
  let value: any = this.config;
  
  for (const k of keys) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    value = value[k];
  }
  
  return value !== undefined ? value : defaultValue;
}

// Example usage
onInit(app: App): void {
  const value1 = this.getConfig('option1', 'fallback');
  const value2 = this.getConfig('nestedOption.subOption1', false);
  
  console.log(`Values: ${value1}, ${value2}`);
}
```

## Configuration UI

For more complex plugins, you might want to provide a web-based configuration UI. UrsaMU provides hooks to add configuration pages to the admin interface.

### Registering a Configuration Page

```typescript
onInit(app: App): void {
  // Register a configuration page
  app.admin.registerConfigPage({
    plugin: this.name,
    title: "My Plugin Settings",
    description: "Configure the My Plugin settings",
    route: "/admin/config/my-plugin",
    component: "MyPluginConfig", // Name of your component
    order: 100 // Display order in the menu
  });
  
  // Register the component
  app.admin.registerComponent("MyPluginConfig", {
    template: `
      <div class="config-page">
        <h1>My Plugin Configuration</h1>
        <form @submit.prevent="saveConfig">
          <div class="form-group">
            <label for="option1">Option 1</label>
            <input type="text" id="option1" v-model="config.option1">
          </div>
          <div class="form-group">
            <label for="option2">Option 2</label>
            <input type="number" id="option2" v-model="config.option2">
          </div>
          <div class="form-group">
            <label for="subOption1">Sub Option 1</label>
            <input type="checkbox" id="subOption1" v-model="config.nestedOption.subOption1">
          </div>
          <div class="form-group">
            <label for="subOption2">Sub Option 2</label>
            <input type="text" id="subOption2" v-model="config.nestedOption.subOption2">
          </div>
          <button type="submit" class="btn btn-primary">Save</button>
        </form>
      </div>
    `,
    data() {
      return {
        config: JSON.parse(JSON.stringify(app.config.plugins[this.name] || {}))
      };
    },
    methods: {
      async saveConfig() {
        try {
          await app.config.setPluginConfig(this.name, this.config);
          app.admin.showNotification("Configuration saved successfully", "success");
        } catch (error) {
          app.admin.showNotification(`Error saving configuration: ${error.message}`, "error");
        }
      }
    }
  });
}
```

## Best Practices

### Configuration Naming

Use clear, descriptive names for your configuration options. Avoid abbreviations and use camelCase for consistency.

```typescript
// Good
config = {
  maxPlayers: 100,
  defaultWelcomeMessage: "Welcome to the game!",
  enableAdvancedFeatures: false
};

// Bad
config = {
  max_plrs: 100,
  def_msg: "Welcome to the game!",
  adv: false
};
```

### Documentation

Document your configuration options thoroughly, both in your code and in your plugin's documentation. Include:

- What each option does
- The expected type and format
- Any constraints (min/max values, allowed strings, etc.)
- The default value

```typescript
/**
 * Configuration for the MyPlugin plugin.
 * 
 * @property {string} option1 - Description of option1. Default: "default"
 * @property {number} option2 - Description of option2. Must be >= 0. Default: 0
 * @property {Object} nestedOption - Nested configuration options
 * @property {boolean} nestedOption.subOption1 - Description of subOption1. Default: false
 * @property {string} nestedOption.subOption2 - Description of subOption2. Default: "default"
 */
config = {
  option1: "default",
  option2: 0,
  nestedOption: {
    subOption1: false,
    subOption2: "default"
  }
};
```

### Sensitive Information

Avoid storing sensitive information (like API keys, passwords, etc.) directly in the configuration. Instead, use environment variables or a separate secure storage mechanism.

```typescript
onInit(app: App): void {
  // Get API key from environment variable, with config as fallback
  this.apiKey = Deno.env.get("MY_PLUGIN_API_KEY") || this.config.apiKey;
  
  if (!this.apiKey) {
    console.error(`[${this.name}] No API key provided. Plugin will not function correctly.`);
  }
}
```

### Configuration Changes

If your plugin needs to respond to configuration changes at runtime, you can register a hook for the `config:change` event:

```typescript
onInit(app: App): void {
  // Register a hook for configuration changes
  app.hooks.on('config:change', (data) => {
    if (data.plugin === this.name) {
      console.log(`Configuration for ${this.name} changed`);
      // Update internal state based on new configuration
      this.updateInternalState();
    }
  });
}

updateInternalState(): void {
  // Update any internal state that depends on configuration
  this.someFeatureEnabled = this.config.enableSomeFeature;
  
  // Restart services if needed
  if (this.service) {
    this.service.stop();
    this.service.start(this.config.serviceOptions);
  }
}
```

## Examples

### Simple Plugin Configuration

```typescript
import { App, IPlugin } from "ursamu";

interface GreeterConfig {
  message: string;
  showTimestamp: boolean;
  delay: number;
}

export default class GreeterPlugin implements IPlugin {
  name = "greeter";
  version = "1.0.0";
  description = "Greets players when they connect";
  author = "Your Name";
  
  config: GreeterConfig = {
    message: "Welcome to the game!",
    showTimestamp: true,
    delay: 1000
  };
  
  private connectHandler: (player: any) => void;
  
  onInit(app: App): void {
    this.connectHandler = (player) => {
      setTimeout(() => {
        let greeting = this.config.message;
        
        if (this.config.showTimestamp) {
          const timestamp = new Date().toLocaleTimeString();
          greeting = `[${timestamp}] ${greeting}`;
        }
        
        player.send(`|c${greeting}|n`);
      }, this.config.delay);
    };
    
    app.hooks.on('player:connect', this.connectHandler);
    
    console.log(`${this.name} initialized with message: "${this.config.message}"`);
  }
  
  onLoad(app: App): void {
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    app.hooks.off('player:connect', this.connectHandler);
    console.log(`${this.name} unloaded`);
  }
}
```

### Complex Plugin Configuration

```typescript
import { App, IPlugin } from "ursamu";

interface DiscordIntegrationConfig {
  enabled: boolean;
  token: string;
  channels: {
    general: string;
    announcements: string;
    admin: string;
  };
  prefix: string;
  syncRoles: boolean;
  roleMapping: Record<string, string>;
  messageOptions: {
    showPlayerName: boolean;
    showTimestamp: boolean;
    embedColor: string;
  };
}

export default class DiscordIntegrationPlugin implements IPlugin {
  name = "discord-integration";
  version = "1.0.0";
  description = "Integrates UrsaMU with Discord";
  author = "Your Name";
  
  config: DiscordIntegrationConfig = {
    enabled: false,
    token: "",
    channels: {
      general: "",
      announcements: "",
      admin: ""
    },
    prefix: "!",
    syncRoles: false,
    roleMapping: {},
    messageOptions: {
      showPlayerName: true,
      showTimestamp: true,
      embedColor: "#0099ff"
    }
  };
  
  private client: any = null;
  
  onInit(app: App): void {
    // Validate configuration
    if (this.config.enabled) {
      if (!this.config.token) {
        console.error(`[${this.name}] Discord token is required when enabled`);
        this.config.enabled = false;
      }
      
      if (!this.config.channels.general) {
        console.error(`[${this.name}] General channel ID is required`);
        this.config.enabled = false;
      }
    }
    
    // Register commands
    app.commands.register("discord-integration", {
      name: "discord",
      pattern: "discord *",
      flags: "connected",
      exec: (ctx) => {
        const args = ctx.args.trim();
        
        if (!args) {
          return ctx.send(`
            |cDiscord Integration Help|n
            discord status - Show Discord connection status
            discord link - Link your Discord account
            discord unlink - Unlink your Discord account
          `);
        }
        
        if (args === "status") {
          const status = this.client ? "connected" : "disconnected";
          ctx.send(`Discord integration is ${this.config.enabled ? 'enabled' : 'disabled'} and ${status}.`);
        }
        
        // Other command handlers...
      }
    });
    
    console.log(`${this.name} initialized`);
  }
  
  onLoad(app: App): void {
    if (this.config.enabled) {
      this.startDiscordClient(app);
    }
    
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    
    console.log(`${this.name} unloaded`);
  }
  
  startDiscordClient(app: App): void {
    // Implementation of Discord client initialization
    console.log(`Starting Discord client with token: ${this.config.token.substring(0, 5)}...`);
    
    // In a real implementation, you would initialize the Discord.js client here
    this.client = {
      destroy: () => console.log("Discord client destroyed")
    };
    
    // Register hooks for sending messages to Discord
    app.hooks.on('channel:message', (data) => {
      if (this.config.enabled && this.client) {
        // Send channel messages to Discord
        console.log(`Would send message to Discord: ${data.message}`);
      }
    });
  }
}
```

By following these guidelines, you can create plugins with flexible, well-documented configuration options that make your plugins more useful and adaptable to different UrsaMU installations. 