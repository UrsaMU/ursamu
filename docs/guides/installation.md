---
layout: layout.vto
title: Installation Guide
description: How to install and set up UrsaMU on your system
---

# Installation Guide

This guide will walk you through the process of installing and setting up UrsaMU
on your system.

## Prerequisites

Before installing UrsaMU, ensure you have the following:

- [**Deno**](https://deno.land/) v1.40 or higher
- Git (for cloning the repository and plugin installs)

## Installation Methods

UrsaMU can be installed in multiple ways. Choose the method that works best for
your environment.

### ⚡ The UrsaMU DX Experience (Recommended)

The easiest way to set up and manage your UrsaMU world is using the **UrsaMU
DX** one-liner. This interactive wizard will walk you through naming your
project, configuring ports, and setting up your first administrator account.

```bash
deno install -A --global -n deno-x jsr:@dx/dx
deno x --install-alias
dx jsr:@ursamu/ursamu init
```
---

### Method 1: Direct from GitHub

```bash
# Clone the repository
git clone https://github.com/ursamu/ursamu.git

# Navigate to the project directory
cd ursamu

# Set up configuration
deno task setup-config
```

### Method 2: Using the UrsaMU CLI

UrsaMU provides a CLI tool for creating new projects:

```bash
# Install the UrsaMU CLI
deno task install-cli

# Create a new project
ursamu create my-game
cd my-game
```

## Configuration

UrsaMU uses a flexible configuration system stored in JSON format:

```bash
# Show the entire configuration
deno task config

# Get a specific configuration value
deno task config --get server.ws

# Set a configuration value
deno task config --set server.ws 4202
```

The configuration is stored in `config/config.json` and includes:

- Server ports and database paths
- Game name, description, and version
- Text file locations
- Plugin settings

For detailed information on all available configuration options, see the
[Configuration Guide](../configuration/).

## Running the Server

UrsaMU uses a dual-server architecture with the main server and telnet server
running as separate processes:

### Starting Both Servers

```bash
# Start both main and telnet servers with watch mode
deno task start
```

This will:

- Start both the main server and telnet server as separate processes
- Enable watch mode for automatic reloading when files change
- Allow each server to restart independently

### Development Mode

For development with auto-restart on file changes:

```bash
deno task dev
```

### Production / Supervised Daemon

Game projects scaffolded with `ursamu create` include `scripts/daemon.sh`,
`scripts/restart.sh`, `scripts/status.sh`, and `scripts/stop.sh`. These run
the server as a supervised background process with signal-driven
no-disconnect restarts. See [Production Deployment](./deployment.md#supervised-daemon-mode)
for details.

## Connecting

### MU* Clients (Recommended for most players)

The easiest way to connect is with a standard MU* client over Telnet (port `4201`):

| Client | Platform | Download |
|--------|----------|---------|
| **Mudlet** | Windows / Mac / Linux | [mudlet.org](https://www.mudlet.org/) |
| **MUSHclient** | Windows | [mushclient.com](https://mushclient.com/) |
| **Potato** | Windows / Mac / Linux | [potatomushclient.com](https://www.potatomushclient.com/) |
| Any terminal | Any | `telnet localhost 4201` |

In your client, add a new connection profile with:
- **Host**: `localhost` (or your server's hostname/IP)
- **Port**: `4201`

Once connected, type `create YourName YourPassword` to create a character, or
`connect YourName YourPassword` to log in.

### WebSocket (Developer / Custom Client)

For direct WebSocket access, connect to `ws://localhost:4203` and send JSON:

```javascript
const socket = new WebSocket("ws://localhost:4203");

// Create a character
socket.send(JSON.stringify({ msg: "create NewCharacter Password", data: {} }));

// Connect as a player
socket.send(JSON.stringify({ msg: "connect PlayerName Password", data: {} }));

// Send any command
socket.send(JSON.stringify({ msg: "look", data: {} }));
```

## First Admin

When the database is empty, UrsaMU prints:

```
Fresh database detected — no players exist yet.

Connect via telnet and run:
  create <name> <password>

The first player created is automatically given superuser access.
```

Connect with a Telnet client (`telnet localhost 4201`) and create your first
account. That first player receives the **superuser** flag (level 10 — the
highest permission level) automatically.

After that, use `@set <player>=admin` in-game to grant admin rights to other
trusted staff. The `superuser` flag itself can only be created via this
first-run flow — it cannot be granted from inside the game.

## Next Steps

Now that you have UrsaMU installed and running, you might want to:

- [**User Guide**](./user-guide.md) - Learn how to use UrsaMU as a player
- [**Configuration**](../configuration/) - Explore detailed configuration
  options
- [**Plugin Development**](../plugins/index.md) - Learn how to create plugins to
  extend UrsaMU
