# UrsaMU

### The Next-Generation MU* Engine

![ursamu header](https://raw.githubusercontent.com/ursamu/ursamu/main/ursamu_github_banner.png)

UrsaMU is a modern, high-performance MUSH-like server built with **TypeScript**
and **Deno**.

---

## ⚡ Quick Start

> [!TIP]
> **No install required!** Run the CLI directly from JSR.

Create a new game project:

```bash
deno run -A jsr:@ursamu/ursamu/create my-game
```

Scaffold a new plugin inside an existing project:

```bash
deno run -A jsr:@ursamu/ursamu/create plugin my-feature
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

- 🚀 **High Performance**: Powered by Deno and Deno KV for modern, efficient execution.
- 🧩 **Plugin System**: Drop a folder in `src/plugins/` — commands, REST routes, and a private database are registered automatically.
- 🌐 **REST API**: Full HTTP API for building custom frontends. Every built-in system exposes clean JSON endpoints.
- 🔌 **WebSocket Auth**: Connect via `ws://host?token=<jwt>&client=web` for JWT pre-auth — no `connect name password` required.
- 🛡️ **Built-in Systems**: Mail, bulletin boards, channels, scenes, and a staff jobs tracker — all plugin-powered and REST-accessible.
- 🛠️ **Developer Friendly**: TypeScript throughout, with a rich `IUrsamuSDK` (`u`) available to every command and script.
- 🔒 **Tiered Permissions**: Flag-based access control — `player`, `builder`, `storyteller`, `admin`, `wizard`, `superuser`.
- 📜 **Sandbox Scripting**: Scripts run in isolated Web Workers. Full SDK access: DB, messaging, channels, auth, system control.
- 🏗️ **CLI Scaffolding**: `create plugin <name>` generates a fully wired plugin skeleton in seconds.

---

## 🏛 Architecture

UrsaMU uses independent processes so each component can restart without affecting the others:

- **Hub** — game logic, Deno KV persistence, HTTP REST API, and WebSocket connections (`4202` WS, `4203` HTTP)
- **Telnet Sidecar** — proxies classic Telnet connections to the Hub via WebSockets (`4201`)
- **Web Client** — optional Deno Fresh browser client (`src/web-client/`)

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

### Bulletin Board Commands

| Command | Description |
|---------|-------------|
| `+bblist` | List all bulletin boards with post and unread counts |
| `+bbread <board>` | List posts on a board |
| `+bbread <board>/<num>` | Read a specific post |
| `+bbpost <board>=<subject>/<body>` | Post to a board |
| `+bbpost/edit <board>/<num>=<body>` | Edit your post |
| `+bbpost/delete <board>/<num>` | Delete your post |

### Staff Jobs Commands

| Command | Description |
|---------|-------------|
| `+job <title>=<description>` | Submit a request |
| `+job/<category> <title>=<desc>` | Submit with category (request/bug/app/idea) |
| `+jobs` | List all visible jobs |
| `+job/view <#>` | View a job |
| `+job/comment <#>=<text>` | Comment on a job |
| `+job/close <#>[=<reason>]` | Close a job |

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
| `+bbcreate <name>[=<description>]` | Create a bulletin board (admin/wizard) |
| `+bbdestroy <board>` | Destroy a bulletin board and all posts (admin/wizard) |
| `+job/assign <#>=<name>` | Assign a job to a staff member |
| `+job/status <#>=<status>` | Set job status |
| `+job/priority <#>=<priority>` | Set job priority |
| `+job/complete <#>=<resolution>` | Mark a job resolved |
| `+job/staffnote <#>=<text>` | Add a staff-only note |

---

## 🌐 REST API

All endpoints require a `Bearer` token except where noted.

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/auth/login` | Authenticate and receive a JWT |
| `POST /api/v1/auth/register` | Create a new character |
| `GET /api/v1/me` | Current user profile |
| `GET /api/v1/players/online` | List connected players |
| `GET /api/v1/channels` | List channels |
| `GET /api/v1/boards` | List bulletin boards with unread counts |
| `GET /api/v1/boards/:id/posts` | List posts on a board |
| `POST /api/v1/boards/:id/posts` | Post to a board |
| `POST /api/v1/boards/:id/read` | Mark a board as read |
| `GET /api/v1/boards/unread` | Total unread counts across all boards |
| `GET /api/v1/jobs` | List jobs (staff see all; players see their own) |
| `POST /api/v1/jobs` | Submit a new job |
| `GET /api/v1/jobs/:id` | Get a single job |
| `PATCH /api/v1/jobs/:id` | Update a job (staff only) |
| `POST /api/v1/jobs/:id/comment` | Add a comment |
| `GET /api/v1/jobs/stats` | Job statistics (staff only) |
| `GET /api/v1/scenes` | List scenes |
| `GET /api/v1/scenes/:id/export` | Export a scene as Markdown or JSON |

---

## 🛠 CLI

```bash
# Create a new game project
deno run -A jsr:@ursamu/ursamu/create my-game

# Scaffold a new plugin (run from your game project root)
deno run -A jsr:@ursamu/ursamu/create plugin my-feature

# Show configuration
deno task config

# Install the CLI tool locally
deno task install-cli
```

---

## 📚 Resources

- 📖 [Official Documentation](https://ursamu.github.io/ursamu/)
- 📦 [API Reference](https://ursamu.github.io/ursamu/api/)
- 🐙 [UrsaMU GitHub](https://github.com/ursamu/ursamu)

---

## 📜 License

UrsaMU is licensed under the **MIT License**.

---

> [!TIP]
> Pull requests are welcome! For major changes, please open an issue first to discuss your ideas.
