# UrSamu Library

UrSamu is now available as a library that you can use to build your own MU* game with minimal effort. This README explains how to use UrSamu as a library in your own projects.

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) (v1.37.0 or higher)

### Installation

To use UrSamu as a library in your project, you can import it directly from the GitHub repository:

```typescript
import { mu } from "https://github.com/lcanady/ursamu/mod.ts";
```

Or clone the repository and import it locally:

```bash
git clone https://github.com/lcanady/ursamu.git
```

Then import it in your project:

```typescript
import { mu } from "./ursamu/src/index.ts";
```

## Basic Usage

The simplest way to use UrSamu is to create a new file (e.g., `game.ts`) and import the library:

```typescript
import { mu, IConfig, IPlugin } from "https://github.com/lcanady/ursamu/mod.ts";

// Start the game with default settings
mu();
```

This will start a new UrSamu game with all the default settings.

## Advanced Usage

### Custom Configuration

You can provide your own configuration to customize the game:

```typescript
import { mu, IConfig } from "https://github.com/lcanady/ursamu/mod.ts";

const myConfig: IConfig = {
  game: {
    name: "My Custom MU",
    description: "A custom MU built with UrSamu",
    version: "1.0.0",
    text: {
      connect: "connect.txt" // Path to connect text file
    }
  },
  server: {
    ws: 4202,    // WebSocket port
    http: 4201,  // HTTP port
    telnet: 4200 // Telnet port
  }
};

mu(myConfig);
```

### Custom Plugins

You can create and load your own plugins:

```typescript
import { mu, IPlugin } from "https://github.com/lcanady/ursamu/mod.ts";

const myPlugins: IPlugin[] = [
  {
    name: "my-custom-plugin",
    version: "1.0.0",
    description: "A custom plugin for my game",
    init: async () => {
      console.log("Initializing my custom plugin");
      return true;
    },
    remove: async () => {
      console.log("Removing my custom plugin");
    }
  }
];

mu(undefined, myPlugins);
```

### Customization Options

You can customize various aspects of the initialization process:

```typescript
import { mu } from "https://github.com/lcanady/ursamu/mod.ts";
import path from "node:path";

const options = {
  loadDefaultCommands: true,      // Load default UrSamu commands
  loadDefaultTextFiles: true,     // Load default UrSamu text files
  autoCreateDefaultRooms: true,   // Create default rooms if none exist
  autoCreateDefaultChannels: true, // Create default channels if none exist
  customCommandsPath: path.join(Deno.cwd(), "commands"), // Path to your custom commands
  customTextPath: path.join(Deno.cwd(), "text"),         // Path to your custom text files
};

mu(undefined, undefined, options);
```

### Full Example

Here's a complete example that combines all of the above:

```typescript
import { mu, IConfig, IPlugin } from "https://github.com/lcanady/ursamu/mod.ts";
import path from "node:path";

// Define your custom configuration
const myConfig: IConfig = {
  game: {
    name: "My Custom MU",
    description: "A custom MU built with UrSamu",
    version: "1.0.0",
    text: {
      connect: "connect.txt"
    }
  },
  server: {
    ws: 4202,
    http: 4201,
    telnet: 4200
  }
};

// Define your custom plugins
const myPlugins: IPlugin[] = [
  {
    name: "my-custom-plugin",
    version: "1.0.0",
    description: "A custom plugin for my game",
    init: async () => {
      console.log("Initializing my custom plugin");
      return true;
    }
  }
];

// Define initialization options
const options = {
  loadDefaultCommands: true,
  loadDefaultTextFiles: true,
  autoCreateDefaultRooms: true,
  autoCreateDefaultChannels: true,
  customCommandsPath: path.join(Deno.cwd(), "commands"),
  customTextPath: path.join(Deno.cwd(), "text"),
};

// Initialize the UrSamu engine
async function startGame() {
  try {
    const engine = await mu(myConfig, myPlugins, options);
    console.log(`${engine.config.get("game.name")} started successfully!`);
  } catch (error) {
    console.error("Failed to start the game:", error);
  }
}

// Start the game
startGame();
```

## API Reference

### `mu(config?, plugins?, options?)`

The main function to initialize the UrSamu engine.

#### Parameters

- `config` (optional): An object containing configuration options
- `plugins` (optional): An array of custom plugins
- `options` (optional): An object containing initialization options

#### Returns

An object containing references to important components:

- `server`: The HTTP server instance
- `config`: Configuration utilities
  - `get(key)`: Get a configuration value
  - `init(config)`: Initialize the configuration
- `plugins`: Plugin utilities
  - `initialize()`: Initialize all registered plugins
  - `load(dir)`: Load plugins from a directory
- `database`: Database access
  - `dbojs`: Database for game objects
  - `chans`: Database for channels
  - `counters`: Database for counters
- `broadcast`: Function to broadcast messages
- `setFlags`: Function to set flags on objects

## Creating Custom Commands

You can create custom commands by placing them in your custom commands directory:

```typescript
// commands/mycommand.ts
import { addCmd } from "https://github.com/lcanady/ursamu/src/services/commands/index.ts";

export default () =>
  addCmd({
    name: "mycommand",
    pattern: /^mycommand\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      ctx.socket.emit("message", {
        msg: `You typed: ${args[1]}`,
      });
    },
  });
```

## Template Project

A template file is provided in the UrSamu repository at `src/template.ts`. You can use this as a starting point for your own project.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 