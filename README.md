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
deno run -A jsr:@ursamu/ursamu/cli create my-game
```

Scaffold a new plugin inside an existing project:

```bash
deno run -A jsr:@ursamu/ursamu/cli create plugin my-feature
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
- 🔌 **WebSocket Auth**: Connect via `ws://host:4203?token=<jwt>&client=web` for JWT pre-auth — no `connect name password` required.
- 🛡️ **Built-in Systems**: Mail, channels, scenes, wiki, and a full attribute/lock engine — all REST-accessible.
- 📦 **Plugin-Powered Extras**: Bulletin boards, staff jobs, and events ship as first-class plugins.
- 🛠️ **Developer Friendly**: TypeScript throughout, with a rich `IUrsamuSDK` (`u`) available to every command and script.
- 🔒 **Tiered Permissions**: Flag-based access control — `player`, `builder`, `storyteller`, `admin`, `wizard`, `superuser`.
- 📜 **Sandbox Scripting**: Scripts run in isolated Web Workers. Full SDK access: DB, messaging, channels, auth, system control.
- 🏗️ **CLI Scaffolding**: `create plugin <name>` generates a fully wired plugin skeleton in seconds.
- 🤖 **Discord Bridge**: Optional Discord↔game channel bridge with automatic reconnect.

---

## 🏛 Architecture

UrsaMU uses independent processes so each component can restart without affecting the others:

- **Hub** — game logic, Deno KV persistence, HTTP REST API, and WebSocket connections (single port, default `4203`)
- **Telnet Sidecar** — proxies classic Telnet connections to the Hub via WebSockets (`4201`)

---

## 🎮 In-Game Commands

### Player Commands

| Command | Description |
|---------|-------------|
| `look` / `l` | Look at your surroundings or an object |
| `say <msg>` / `"<msg>` | Speak to others in the room |
| `pose <action>` / `:<action>` | Perform an emote/action |
| `think <msg>` | Send a private thought visible only to you |
| `page <player>=<msg>` | Send a private message to any online player |
| `who` | List currently connected players |
| `@doing <text>` | Set your status message shown in `who` |
| `inventory` / `inv` | List items you are carrying |
| `score` | View your character stats |
| `get <object>` | Pick up an object |
| `drop <object>` | Drop an object |
| `give <object>=<player>` | Give an object to another player |
| `home` | Return to your home location |
| `@teleport <destination>` | Teleport to a location or object |
| `examine <object>` | Inspect an object in detail |
| `@desc <object>=<text>` | Set a description on an object |
| `@name <object>=<name>` | Rename an object |
| `quit` | Disconnect from the server |
| `help [<topic>]` | Display help information |

### Channel Commands

| Command | Description |
|---------|-------------|
| `@channel/list` | List all available channels |
| `@channel/join <name>=<alias>` | Join a channel with a local alias |
| `@channel/leave <alias>` | Leave a channel |
| `<alias> <message>` | Send a message on a joined channel |

### In-Game Mail Commands

| Command | Description |
|---------|-------------|
| `@mail` | Show your mail inbox |
| `@mail/send <to>=<subject>/<body>` | Send a mail message |
| `@mail/read <num>` | Read a message |
| `@mail/reply <num>=<body>` | Reply to a message |
| `@mail/replyall <num>=<body>` | Reply to all recipients |
| `@mail/forward <num>=<to>` | Forward a message |
| `@mail/cc <addr>` | Add a CC recipient while composing |
| `@mail/bcc <addr>` | Add a BCC recipient while composing |
| `@mail/subject <text>` | Set subject while composing |
| `@mail/proof` | Preview message being composed |
| `@mail/abort` | Discard message being composed |
| `@mail/delete <num>` | Delete a message |

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

### Events Commands

| Command | Description |
|---------|-------------|
| `+events` | List upcoming events |
| `+event/view <#>` | View event details |
| `+event/rsvp <#>` | RSVP to an event |
| `+event/unrsvp <#>` | Cancel your RSVP |

### Building Commands

| Command | Description |
|---------|-------------|
| `@dig <name>` | Create a new room |
| `@create <name>` | Create a new object |
| `@open <exit>=<dest>` | Create an exit to another room |
| `@link <object>=<dest>` | Link an exit or set home/dropto |
| `@unlink <object>` | Remove a link from an object |
| `@clone <object>` | Clone an existing object |
| `@destroy <object>` | Destroy an object |
| `@alias <object>=<alias>` | Set an alias on an object |
| `@parent <object>=<parent>` | Set an object's parent |
| `@parent/clear <object>` | Clear an object's parent |
| `@lock <object>=<expr>` | Set a lock expression on an object |
| `@unlock <object>` | Remove a lock from an object |
| `@set <object>=<flag>` | Set a flag on an object |
| `@set <object>=<attr>:<value>` | Set an attribute on an object |
| `&<ATTR> <object>=<value>` | Shorthand attribute assignment |
| `@wipe <object>` | Remove all attributes from an object |
| `@trigger <object>/<attr>` | Execute a stored script attribute |
| `@nameformat <object>=<format>` | Set a custom name format |
| `@descformat <object>=<format>` | Set a custom description format |
| `@conformat <object>=<format>` | Set a custom contents format |
| `@exitformat <object>=<format>` | Set a custom exits format |
| `@find [<name>]` | Search objects by name or flag |
| `@quota` | Show your object creation quota |

### Admin Commands

| Command | Description |
|---------|-------------|
| `@boot <player>` | Disconnect a player |
| `@toad <player>` | Convert a player to an object |
| `@newpassword <player>=<pass>` | Reset a player's password |
| `@chown <object>=<player>` | Transfer ownership of an object |
| `@moniker <object>=<name>` | Set an alternate display name (admin/wizard) |
| `@emit <message>` | Send an attributed message to the room (admin+) |
| `@remit <message>` | Send a message to the room (admin+) |
| `@pemit <player>=<message>` | Send a message directly to a player (admin+) |
| `@motd` | Show the message of the day |
| `@motd/set <text>` | Set the message of the day (admin+) |
| `@motd/clear` | Clear the message of the day (admin+) |
| `@stats` | Show server statistics |
| `@stats/full` | Show full server statistics |
| `@search [<flags>]` | Search objects server-wide |
| `@quota <player>=<num>` | Set a player's object quota (admin+) |
| `@reboot` | Restart the server (admin+) |
| `@shutdown` | Shut down the server (admin+) |
| `@site <key>=<value>` | Set a server configuration value (admin/wizard) |
| `@resettoken <player>` | Generate a one-time password-reset token for a player (admin/wizard) |
| `@chancreate <name>[=<header>]` | Create a channel (admin/wizard) |
| `@chandestroy <name>` | Destroy a channel (admin/wizard) |
| `@chanset <name>/<prop>=<value>` | Configure a channel (admin/wizard) |
| `+bbcreate <name>[=<description>]` | Create a bulletin board (admin/wizard) |
| `+bbdestroy <board>` | Destroy a bulletin board and all posts (admin/wizard) |
| `+event/create <title>=<desc>` | Create an event (staff) |
| `+event/edit <#>/<field>=<value>` | Edit event fields (staff) |
| `+event/status <#>=<status>` | Set event status (staff) |
| `+event/cancel <#>` | Cancel an event (staff) |
| `+event/delete <#>` | Delete an event (staff) |
| `+job/assign <#>=<name>` | Assign a job to a staff member |
| `+job/status <#>=<status>` | Set job status |
| `+job/priority <#>=<priority>` | Set job priority |
| `+job/complete <#>=<resolution>` | Mark a job resolved |
| `+job/reopen <#>` | Reopen a closed job |
| `+job/delete <#>` | Delete a job |
| `+job/staffnote <#>=<text>` | Add a staff-only note |

---

## 🌐 REST API

All endpoints require a `Bearer` token except where noted.

### Auth

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/v1/auth/register` | None | Create a new character |
| `POST /api/v1/auth/login` | None | Authenticate and receive a JWT |
| `POST /api/v1/auth/reset-password` | None | Consume a reset token and set a new password |

### Player & Channels

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/me` | Required | Current user profile |
| `GET /api/v1/players/online` | None | List connected players |
| `GET /api/v1/channels` | None | List all channels |

### Database Objects

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/dbos` | Required | List accessible objects (optional `?flags=` filter) |
| `GET /api/v1/dbobj/:id` | Required | Fetch a single object |
| `PATCH /api/v1/dbobj/:id` | Required | Update object data, name, or description |

### Scenes

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/scenes` | Required | List active scenes |
| `POST /api/v1/scenes` | Required | Create a new scene |
| `GET /api/v1/scenes/locations` | Required | List accessible rooms |
| `GET /api/v1/scenes/:id` | Required | Get scene details with participants |
| `PATCH /api/v1/scenes/:id` | Required | Update scene metadata (name, status, type, etc.) |
| `GET /api/v1/scenes/:id/export` | Required | Export scene as `?format=markdown` or `?format=json` |
| `POST /api/v1/scenes/:id/pose` | Required | Add a pose/ooc/set entry to the scene |
| `PATCH /api/v1/scenes/:id/pose/:poseId` | Required | Edit an existing pose |
| `POST /api/v1/scenes/:id/join` | Required | Join a scene |
| `POST /api/v1/scenes/:id/invite` | Required | Invite a player to a scene (owner only) |

### Mail

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/mail` | Required | Inbox |
| `GET /api/v1/mail/sent` | Required | Sent messages |
| `POST /api/v1/mail` | Required | Send a new message |
| `GET /api/v1/mail/:id` | Required | Read a message (marks as read) |
| `DELETE /api/v1/mail/:id` | Required | Delete a message |

### Building

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/v1/building/room` | Required | Create a room (builder+) |

### Wiki

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/wiki` | None | List all wiki topics |
| `GET /api/v1/wiki/:topic` | None | Retrieve a wiki topic |

### Config & Text

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/config` | None | Server configuration (name, version, ports, theme) |
| `GET /api/v1/connect` | None | Connect screen text |
| `GET /api/v1/welcome` | None | Welcome text |

### Health

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Health check — returns `{"status":"ok","engine":"UrsaMU"}` |

---

## 🛠 CLI

```bash
# Create a new game project
deno run -A jsr:@ursamu/ursamu/cli create my-game

# Scaffold a new in-tree plugin (run from your game project root)
deno run -A jsr:@ursamu/ursamu/cli create plugin my-feature

# Scaffold a standalone publishable plugin
deno run -A jsr:@ursamu/ursamu/cli create plugin my-feature --standalone

# Plugin management
deno run -A jsr:@ursamu/ursamu/cli plugin list
deno run -A jsr:@ursamu/ursamu/cli plugin install <github-url>
deno run -A jsr:@ursamu/ursamu/cli plugin update <name>
deno run -A jsr:@ursamu/ursamu/cli plugin remove <name>
deno run -A jsr:@ursamu/ursamu/cli plugin info <name>

# Show configuration
deno task config

# Update ursamu engine to the latest version (run from game project root)
deno run -A jsr:@ursamu/ursamu/cli update

# Preview what update would change without writing anything
deno run -A jsr:@ursamu/ursamu/cli update --dry-run

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
