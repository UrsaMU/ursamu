# UrsaMU

### The Next-Generation MU* Engine

![ursamu header](https://raw.githubusercontent.com/ursamu/ursamu/main/ursamu_github_banner.png)

UrsaMU is a modern, high-performance MUSH-like server built with **TypeScript**
and **Deno**.

---

## ⚡ Quick Start: The "DX" Experience

The easiest way to create and manage an UrsaMU project is using `dx` (if
installed) or `deno run`.

> [!TIP]
> **No install required!** You can run the CLI directly from JSR.

### Creates a new Project

First, ensure you have `dx` installed:

```bash
deno install -A --global -n deno-x jsr:@dx/dx
deno x --install-alias
```

Then create your project:

```bash
dx jsr:@ursamu/ursamu init
```

_Or without `dx`:_

```bash
deno run -A jsr:@ursamu/ursamu init
```

### Manage Plugins

You can also manage plugins smoothly without installing a global binary:

```bash
# List plugins
dx jsr:@ursamu/ursamu plugin list

# Install a plugin
dx jsr:@ursamu/ursamu plugin install https://github.com/my/plugin
```

---

## 📋 Prerequisites

You must have **Deno** installed on your system.

### Mac & Linux

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### Windows (PowerShell)

```powershell
irm https://deno.land/install.ps1 | iex
```

---

## ✨ Features

- 🚀 **High Performance**: Powered by Deno and Deno KV for modern, efficient
  execution.
- 🧩 **Modular Architecture**: Microservices-based design with independent
  processes.
- 🔌 **Extensible**: Powerful plugin system to build your unique MU* experience.
- 🌐 **Modern Networking**: Native WebSocket support and REST APIs.
- 🛡️ **Built-in Systems**: Integrated mail, bulletin boards, and channel
  management (including admin-controlled channel creation, configuration, and
  destruction).
- 🛠️ **Developer Friendly**: Built with TypeScript, ensuring type safety and
  great IDE support.
- 🔒 **Tiered Permissions**: Granular flag-based access control with `player`,
  `admin`, and `wizard` (superuser-only) roles.
- 📜 **Sandbox Scripting**: Scripts run in isolated Web Workers with a rich SDK
  (`u`) for DB access, messaging, channel management, authentication, and system
  control.

---

## 🏛 Architecture

UrsaMU is designed to be resilient and modular:

- **Main Server**: Handles game logic, persistence, and the modern web stack
  (HTTP/WebSockets). Runs on `localhost:4202` (WS) and `localhost:4203`
  (HTTP/WS).
- **Telnet Sidecar**: A lightweight, independent process that proxies classic
  Telnet connections to the main server via WebSockets (default port `4201`).
- **Web Client**: A Deno Fresh frontend served at `http://localhost:8000`.
- **Deno KV**: Provides low-latency, transactional storage for all game data.

---

## 🎮 In-Game Commands

### Player Commands

| Command | Description |
|---------|-------------|
| `look` / `l` | Look at your surroundings or an object |
| `say <msg>` / `"<msg>` | Speak to others in the room |
| `pose <action>` / `:<action>` | Perform an emote/action |
| `page <player>=<msg>` | Send a private message to any online player |
| `who` | List currently connected players |
| `inventory` / `inv` | List items you are carrying |
| `score` | View your character stats |
| `get <object>` | Pick up an object |
| `drop <object>` | Drop an object |
| `give <object>=<player>` | Give an object to another player |
| `home` | Return to your home location |
| `teleport <destination>` | Teleport to a location or object |
| `examine <object>` | Inspect an object in detail |
| `@desc <object>=<text>` | Set a description on an object |
| `@name <object>=<name>` | Rename an object |
| `@moniker <object>=<name>` | Set an alternate display name |
| `quit` | Disconnect from the server |
| `help [<topic>]` | Display help information |

### Channel Commands

| Command | Description |
|---------|-------------|
| `@channel/list` | List all available channels |
| `@channel/join <name>=<alias>` | Join a channel with a local alias |
| `@channel/leave <alias>` | Leave a channel |
| `<alias> <message>` | Send a message on a joined channel |

### Building Commands

| Command | Description |
|---------|-------------|
| `@dig <name>` | Create a new room |
| `@create <name>` | Create a new object |
| `@open <exit>=<dest>` | Create an exit to another room |
| `@link <exit>=<dest>` | Link an exit to a destination |
| `@unlink <exit>` | Remove a link from an exit |
| `@clone <object>` | Clone an existing object |
| `@destroy <object>` | Destroy an object |
| `@parent <object>=<parent>` | Set an object's parent |
| `@lock <object>=<expr>` | Set a lock expression on an object |
| `@set <object>=<flag>` | Set a flag on an object |

### Admin Commands

| Command | Description |
|---------|-------------|
| `@boot <player>` | Disconnect a player |
| `@toad <player>` | Convert a player to an object |
| `@newpassword <player>=<pass>` | Reset a player's password |
| `@chown <object>=<player>` | Transfer ownership of an object |
| `@reboot` | Restart the server (admin+) |
| `@shutdown` | Shut down the server (admin+) |
| `@chancreate <name>[=<header>]` | Create a channel (admin/wizard) |
| `@chandestroy <name>` | Destroy a channel (admin/wizard) |
| `@chanset <name>/<prop>=<value>` | Configure a channel (admin/wizard) |

---

## 🛠 Command Line Interface

Manage your game directly from the terminal:

```bash
# Show configuration
deno task config

# Install the CLI tool
deno task install-cli
```

---

## 📚 Resources

Documentation is hosted on GitHub Pages:

- 📖 [Official Documentation](https://ursamu.github.io/ursamu/)
- 📦 [API Reference](https://ursamu.github.io/ursamu/api/)
- 🐙 [UrsaMU GitHub](https://github.com/ursamu/ursamu)

---

## 📜 License

UrsaMU is licensed under the **MIT License**.

---

> [!TIP]
> Pull requests are welcome! For major changes, please open an issue first to
> discuss your ideas.
