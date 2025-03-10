# UrsaMU Configuration System

This is a user-friendly configuration system for UrsaMU that works with a modular plugin system. It's inspired by the Node.js `config` package but built for Deno.

## Features

- **Simple API**: Easy-to-use functions for getting and setting configuration values
- **Dot Notation**: Access nested configuration values using dot notation (e.g., `server.port`)
- **Plugin Support**: Plugins can register their own configuration sections
- **JSON Storage**: Configuration is stored in a JSON file in the `/config` directory at the project root
- **Default Values**: Default configuration values are provided but can be overridden
- **Type Safety**: TypeScript types for configuration values

## Usage

### Basic Usage

```typescript
import { getConfig, setConfig } from "./services/Config/mod.ts";

// Get a configuration value
const serverPort = getConfig<number>("server.ws");

// Set a configuration value
setConfig("server.ws", 4202);

// Get the entire configuration
const allConfig = getAllConfig();
```

### Plugin Configuration

Plugins can register their own configuration sections:

```typescript
import { registerPlugin } from "./services/Config/mod.ts";

// Define a plugin with configuration
const myPlugin = {
  name: "myPlugin",
  version: "1.0.0",
  description: "My awesome plugin",
  config: {
    enabled: true,
    options: {
      feature1: true,
      feature2: false
    }
  },
  init: async () => {
    // Plugin initialization code
    return true;
  }
};

// Register the plugin
registerPlugin(myPlugin);

// Later, you can access the plugin's configuration
const pluginConfig = getConfig<any>("plugins.myPlugin");
const isFeature1Enabled = getConfig<boolean>("plugins.myPlugin.options.feature1");
```

### For Administrators

Administrators can edit the `config.json` file directly in the `/config` directory at the project root. This file is created automatically when the server starts if it doesn't exist.

Example `config.json`:

```json
{
  "server": {
    "telnet": 4201,
    "ws": 4202,
    "http": 4203,
    "db": "data/ursamu.db",
    "counters": "data/counters.db",
    "chans": "data/chans.db",
    "mail": "data/mail.db",
    "bboard": "data/bboard.db"
  },
  "game": {
    "name": "Ursamu",
    "description": "A Modern MUSH-Like engine written in Typescript.",
    "version": "0.0.1",
    "text": {
      "connect": "../text/default_connect.txt"
    },
    "playerStart": "1"
  },
  "plugins": {
    "myPlugin": {
      "enabled": true,
      "options": {
        "feature1": true,
        "feature2": false
      }
    }
  }
}
```

## API Reference

### `initConfig(config?: IConfig): void`

Initialize the configuration system with an optional configuration object.

### `getConfig<T>(key: string): T`

Get a configuration value by key. Supports dot notation.

### `setConfig(key: string, value: any): void`

Set a configuration value by key. Supports dot notation.

### `getAllConfig(): Record<string, any>`

Get the entire configuration object.

### `registerPlugin(plugin: IPlugin): void`

Register a plugin with the system.

### `initializePlugins(): Promise<void>`

Initialize all registered plugins.

## Advanced Usage

For more advanced usage, you can access the underlying `ConfigManager` and `PluginConfigManager` classes:

```typescript
import { ConfigManager, PluginConfigManager } from "./services/Config/mod.ts";

// Create a custom configuration manager
const customConfigManager = ConfigManager.init(myCustomConfig);

// Get the configuration directory
const configDir = customConfigManager.getConfigDir();

// Create a custom plugin manager
const customPluginManager = PluginConfigManager.init(customConfigManager);
``` 