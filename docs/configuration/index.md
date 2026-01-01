---
layout: layout.vto
title: Configuration
description: Learn how to configure UrsaMU for your needs
nav:
  - text: Overview
    url: "#overview"
  - text: Configuration Files
    url: "#configuration-files"
  - text: Server Configuration
    url: "#server-configuration"
  - text: Game Configuration
    url: "#game-configuration"
  - text: Database Configuration
    url: "#database-configuration"
  - text: Plugin Configuration
    url: "#plugin-configuration"
  - text: Text Files
    url: "#text-files"
  - text: Advanced Configuration
    url: "#advanced-configuration"
---

# Configuring UrsaMU

This guide explains how to configure UrsaMU for your specific needs.

## Overview

UrsaMU uses a flexible configuration system that allows you to customize various
aspects of the game. The configuration is stored in JSON files and can be
accessed programmatically through the configuration API.

## Configuration Files

The main configuration file is typically located at `config/config.json`. This
file contains settings for the server, game, database, and other components.

Here's an example of a basic configuration file:

```json
{
  "server": {
    "telnet": 4201,
    "ws": 4202,
    "http": 4203,
    "db": "data/ursamu.db",
    "counters": "counters",
    "chans": "chans",
    "mail": "mail",
    "bboard": "bboard"
  },
  "game": {
    "name": "UrsaMU",
    "description": "A Modern MUSH-Like engine written in Typescript.",
    "version": "0.0.1",
    "text": {
      "connect": "text/default_connect.txt"
    },
    "playerStart": "1"
  }
}
```

## Server Configuration

The `server` section of the configuration file contains settings related to the
server:

```json
{
  "server": {
    "telnet": 4201,
    "ws": 4202,
    "http": 4203,
    "db": "data/ursamu.db",
    "counters": "counters",
    "chans": "chans",
    "mail": "mail",
    "bboard": "bboard"
  }
}
```

### Server Options

- `telnet` (number): The port for the telnet server (default: 4201)
- `ws` (number): The port for the WebSocket server (default: 4202)
- `http` (number): The port for the HTTP server (default: 4203)
- `db` (string): Path to the database file (default: "data/ursamu.db")
- `counters` (string): DB prefix for counters (default: "counters")
- `chans` (string): DB prefix for channels (default: "chans")
- `mail` (string): DB prefix for mail (default: "mail")
- `bboard` (string): DB prefix for bulletin boards (default: "bboard")

## Game Configuration

The `game` section contains settings related to the game itself:

```json
{
  "game": {
    "name": "My UrsaMU Game",
    "motd": "Welcome to My UrsaMU Game!",
    "debug": false,
    "startingRoom": "1",
    "startingMoney": 100,
    "maxPlayers": 100,
    "idleTimeout": 3600
  }
}
```

### Game Options

- `name` (string): The name of the game (default: "UrsaMU")
- `motd` (string): Message of the day (default: "Welcome to UrsaMU!")
- `debug` (boolean): Whether to enable debug mode (default: false)
- `startingRoom` (string): The ID of the starting room for new players (default:
  "1")
- `startingMoney` (number): The amount of money new players start with
  (default: 0)
- `maxPlayers` (number): The maximum number of players allowed (default: 0,
  unlimited)
- `idleTimeout` (number): The number of seconds before a player is considered
  idle (default: 3600)

## Plugin Configuration

Plugins can have their own configuration sections in the main configuration
file:

```json
{
  "plugins": {
    "my-plugin": {
      "enabled": true,
      "option1": "value1",
      "option2": 42
    }
  }
}
```

### Accessing Plugin Configuration

Plugins can access their configuration using the `getConfig` function:

```typescript
import { getConfig } from "../../services/Config/mod.ts";

// Get a plugin configuration value with a default fallback
const option1 = getConfig("plugins.my-plugin.option1", "default");
const option2 = getConfig("plugins.my-plugin.option2", 0);
```

## Text Files

UrsaMU uses text files for various game messages. These files are typically
located in the `config/text` directory:

- `connect.txt`: The connection screen shown to players when they connect
- `motd.txt`: The message of the day shown to players when they connect
- `welcome.txt`: The welcome message shown to new players
- `help.txt`: The help text shown to players when they type "help"

### Example Text File

Here's an example of a `connect.txt` file:

```
%ch%cy==================================%cn
%ch%cw           My UrsaMU Game        %cn
%ch%cy==================================%cn

Welcome to My UrsaMU Game!

Type 'connect <name> <password>' to connect.
Type 'create <name> <password>' to create a new character.
Type 'quit' to disconnect.

%ch%cy==================================%cn
```

### Color Codes

Text files can use color codes to add color to the text:

- `%cn`: Reset to default color
- `%ch`: Highlight (bold)
- `%cr`: Red
- `%cg`: Green
- `%cy`: Yellow
- `%cb`: Blue
- `%cm`: Magenta
- `%cc`: Cyan
- `%cw`: White

## Advanced Configuration

### Configuration API

UrsaMU provides a configuration API for accessing and modifying configuration
values programmatically:

```typescript
import { getConfig, setConfig } from "../../services/Config/mod.ts";

// Get a configuration value
const port = getConfig("server.port", 4201);

// Set a configuration value
await setConfig("server.port", 4202);
```

### Environment Variables

UrsaMU supports environment variables for configuration. Environment variables
take precedence over values in the configuration file.

Environment variables should be prefixed with `URSAMU_` and use underscores
instead of dots:

```
URSAMU_SERVER_PORT=4202
URSAMU_GAME_NAME="My UrsaMU Game"
URSAMU_DATABASE_PATH="./custom-data"
```

### Configuration Hierarchy

UrsaMU uses the following hierarchy for configuration values (from highest to
lowest precedence):

1. Environment variables
2. Values set programmatically via `setConfig`
3. Values in the configuration file
4. Default values

### Custom Configuration Files

You can specify a custom configuration file when starting UrsaMU:

```typescript
import { mu } from "ursamu";
import { config } from "./my-custom-config.ts";

await mu({ config });
```

### Dynamic Configuration

Some configuration values can be changed at runtime:

```typescript
import { setConfig } from "../../services/Config/mod.ts";

// Change the game name at runtime
await setConfig("game.name", "New Game Name");
```

### Configuration Validation

UrsaMU validates configuration values to ensure they are of the correct type and
within acceptable ranges. If a configuration value is invalid, UrsaMU will log a
warning and use the default value instead.

### Example: Complete Configuration

Here's an example of a complete configuration file with all available options:

```json
{
  "server": {
    "port": 4201,
    "host": "0.0.0.0",
    "webSocket": true,
    "telnet": true,
    "web": true,
    "webPort": 4202,
    "ssl": {
      "enabled": false,
      "key": "path/to/key.pem",
      "cert": "path/to/cert.pem"
    }
  },
  "game": {
    "name": "My UrsaMU Game",
    "motd": "Welcome to My UrsaMU Game!",
    "debug": false,
    "startingRoom": "1",
    "startingMoney": 100,
    "maxPlayers": 100,
    "idleTimeout": 3600,
    "registerEnabled": true,
    "guestEnabled": true,
    "guestPrefix": "Guest"
  },
  "database": {
    "path": "./data",
    "backupInterval": 3600000,
    "maxBackups": 5
  },
  "plugins": {
    "my-plugin": {
      "enabled": true,
      "option1": "value1",
      "option2": 42
    }
  },
  "logging": {
    "level": "info",
    "file": "logs/ursamu.log",
    "maxSize": 10485760,
    "maxFiles": 5
  }
}
```

By following this guide, you can configure UrsaMU to suit your specific needs
and create a customized MU* experience.
