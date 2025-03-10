---
layout: layout.njk
description: Learn how to create a child game using UrsaMU as a library
nav:
  - text: Overview
    url: "#overview"
  - text: Getting Started
    url: "#getting-started"
  - text: Project Structure
    url: "#project-structure"
  - text: Configuration
    url: "#configuration"
  - text: Customization
    url: "#customization"
  - text: Deployment
    url: "#deployment"
  - text: Examples
    url: "#examples"
---

# Creating Child Games with UrsaMU

This guide explains how to create a child game using UrsaMU as a library.

## Overview

A "child game" is a complete MU* game built on top of the UrsaMU engine. Unlike plugins, which extend the functionality of UrsaMU, a child game is a standalone application that uses UrsaMU as a library.

Creating a child game allows you to:

- Create a completely customized MU* experience
- Define your own game world, theme, and mechanics
- Distribute your game as a standalone application
- Maintain your game separately from the UrsaMU core

## Getting Started

### Prerequisites

Before creating a child game, ensure you have:

- [Deno](https://deno.land/) installed (version 1.37.0 or higher)
- Basic knowledge of TypeScript
- Understanding of MU* concepts

### Installation

1. Create a new directory for your game:

```bash
mkdir my-game
cd my-game
```

2. Initialize a new Deno project:

```bash
deno init
```

3. Install UrsaMU as a dependency:

```bash
# Add UrsaMU as a dependency in your deps.ts file
```

## Project Structure

A typical child game project structure looks like this:

```
my-game/
├── config/                  # Configuration files
│   ├── config.json          # Main configuration
│   ├── text/                # Text files
│   └── plugins/             # Plugin configurations
├── src/                     # Source code
│   ├── commands/            # Custom commands
│   ├── plugins/             # Custom plugins
│   ├── types/               # TypeScript type definitions
│   └── main.ts              # Entry point
├── data/                    # Database files (generated)
├── deps.ts                  # Dependencies
├── deno.json                # Deno configuration
└── README.md                # Documentation
```

## Configuration

### Basic Configuration

Create a `config/config.json` file with your game's configuration:

```json
{
  "server": {
    "port": 4201,
    "host": "0.0.0.0"
  },
  "game": {
    "name": "My Game",
    "motd": "Welcome to My Game!",
    "debug": false
  },
  "database": {
    "path": "./data"
  }
}
```

### Text Files

UrsaMU uses text files for various game messages. Create a `config/text` directory and add your custom text files:

```
config/text/
├── connect.txt       # Connection screen
├── motd.txt          # Message of the day
└── welcome.txt       # Welcome message for new players
```

## Customization

### Creating the Main File

Create a `src/main.ts` file as the entry point for your game:

```typescript
import { mu } from "ursamu";
import { config } from "../config/mod.ts";

// Import your custom plugins
import myPlugin from "./plugins/myPlugin/mod.ts";

// Start the game
await mu({
  config,
  plugins: [
    myPlugin,
    // Add more custom plugins here
  ]
});

console.log("Game started!");
```

### Custom Commands

Create custom commands in the `src/commands` directory:

```typescript
// src/commands/hello.ts
import { registerCommand } from "ursamu";

registerCommand({
  name: "hello",
  pattern: "hello *",
  flags: "connected",
  exec: (ctx) => {
    const target = ctx.args.trim() || "World";
    ctx.send(`Hello, ${target}!`);
  }
});
```

### Custom Plugins

Create custom plugins in the `src/plugins` directory:

```typescript
// src/plugins/myPlugin/mod.ts
import { IPlugin } from "ursamu";

const myPlugin: IPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  description: "A custom plugin for my game",
  
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

## Deployment

### Running Your Game

Run your game with Deno:

```bash
deno run --allow-net --allow-read --allow-write --allow-env src/main.ts
```

### Creating a Startup Script

Create a `start.sh` script for easier startup:

```bash
#!/bin/bash
deno run --allow-net --allow-read --allow-write --allow-env src/main.ts
```

Make it executable:

```bash
chmod +x start.sh
```

### Docker Deployment

Create a `Dockerfile` for containerized deployment:

```dockerfile
FROM denoland/deno:1.37.0

WORKDIR /app

COPY . .

RUN deno cache src/main.ts

EXPOSE 4201

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "src/main.ts"]
```

Build and run the Docker container:

```bash
docker build -t my-game .
docker run -p 4201:4201 my-game
```

## Examples

### Basic Child Game

Here's a complete example of a basic child game:

```typescript
// deps.ts
export { mu, registerCommand, IPlugin } from "ursamu";

// src/main.ts
import { mu } from "../deps.ts";
import welcomePlugin from "./plugins/welcome/mod.ts";

// Define configuration
const config = {
  server: {
    port: 4201,
    host: "0.0.0.0"
  },
  game: {
    name: "My First MU",
    motd: "Welcome to My First MU!"
  }
};

// Start the game
await mu({
  config,
  plugins: [welcomePlugin]
});

console.log(`${config.game.name} is running on port ${config.server.port}`);

// src/plugins/welcome/mod.ts
import { IPlugin, registerCommand } from "../../../deps.ts";

const welcomePlugin: IPlugin = {
  name: "welcome",
  version: "1.0.0",
  description: "A welcome plugin for new players",
  
  init: async () => {
    // Register a welcome command
    registerCommand({
      name: "welcome",
      pattern: "welcome *",
      flags: "connected",
      exec: (ctx) => {
        const target = ctx.args.trim() || "friend";
        ctx.send(`Welcome to our game, ${target}!`);
      }
    });
    
    return true;
  },
  
  remove: async () => {
    // Cleanup code here
  }
};

export default welcomePlugin;
```

### Advanced Child Game

For a more advanced example, see the [UrsaMU Examples repository](https://github.com/UrsaMU/examples) which contains complete child game examples with various features.

### Customizing the Database

You can customize how your game uses the database:

```typescript
// src/main.ts
import { mu } from "../deps.ts";

await mu({
  config: {
    // ... other config options
    database: {
      path: "./custom-data",
      backupInterval: 3600000 // Backup every hour
    }
  }
});
```

### Creating a Custom Theme

You can create a custom theme by overriding the default text files and adding custom CSS for the web interface:

```typescript
// src/plugins/theme/mod.ts
import { IPlugin } from "../../../deps.ts";

const themePlugin: IPlugin = {
  name: "custom-theme",
  version: "1.0.0",
  description: "Custom theme for my game",
  
  init: async () => {
    // Register custom CSS
    // Set up custom colors
    // Override default text files
    return true;
  }
};

export default themePlugin;
```

By following this guide, you can create a fully customized MU* game using UrsaMU as a foundation, while maintaining the flexibility to extend and modify it to suit your specific needs. 