---
layout: layout.njk
description: How to install and set up UrsaMU on your system
nav:
  - text: Prerequisites
    url: "#prerequisites"
  - text: Installation Methods
    url: "#installation-methods"
  - text: Configuration
    url: "#configuration"
  - text: Running the Server
    url: "#running-the-server"
  - text: Connecting
    url: "#connecting"
  - text: Next Steps
    url: "#next-steps"
---

# Installation Guide

This guide will walk you through the process of installing and setting up UrsaMU
on your system.

## Prerequisites

Before installing UrsaMU, ensure you have the following:

- [**Deno**](https://deno.land/) version 1.32.0 or higher
- Git (for cloning the repository)

## Installation Methods

UrsaMU can be installed in multiple ways. Choose the method that works best for
your environment.

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

### Method 3: Using Docker

UrsaMU provides a Docker image for easy deployment:

```bash
# Clone the repository
git clone https://github.com/ursamu/ursamu.git
cd ursamu

# Start the server with Docker Compose
docker-compose up -d
```

The game databases will be exported to the `data/` directory, and configuration
will be stored in the `config/` directory.

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

For development with individual servers:

```bash
# Main server only with watch mode
deno task server

# Telnet server only with watch mode
deno task telnet
```

## Connecting

Once the server is running, you can connect to it using:

- **Telnet Client**: `telnet localhost 4201`
- **Web Client**: http://localhost:4203 (if you build a web interface)
- **Socket.IO Client**: Connect to `http://localhost:4202` from custom clients
  using the Socket.IO client library

Example Socket.IO client connection:

```javascript
// Using the Socket.IO client library
import { io } from "socket.io-client";

const socket = io("http://localhost:4202");

socket.on("connect", () => {
  console.log("Connected to UrsaMU server");
});

// Listen for messages from the server
socket.on("message", (data) => {
  console.log("Received:", data.msg);

  // Handle special data like disconnection
  if (data.data?.quit) {
    console.log("Server requested disconnect");
    socket.disconnect();
  }
});

// Send a command to the server
socket.emit("message", {
  msg: "look",
  data: {},
});

// To connect as a player
socket.emit("message", {
  msg: "connect PlayerName Password",
  data: {},
});

// To create a new character
socket.emit("message", {
  msg: "create NewCharacter Password",
  data: {},
});

// To disconnect
socket.emit("message", {
  msg: "quit",
  data: {},
});
```

## Next Steps

Now that you have UrsaMU installed and running, you might want to:

- [**User Guide**](./user-guide) - Learn how to use UrsaMU as a player
- [**Configuration**](../configuration/) - Explore detailed configuration
  options
- [**Plugin Development**](../plugins/index.md) - Learn how to create plugins to
  extend UrsaMU
