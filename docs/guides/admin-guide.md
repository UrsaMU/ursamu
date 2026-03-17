---
layout: layout.vto
title: Admin Guide
description: Learn how to administer an UrsaMU server
nav:
  - text: First-Run Setup
    url: "#first-run-setup"
  - text: User Management
    url: "#user-management"
  - text: Web Client
    url: "#web-client"
  - text: Server Configuration
    url: "#server-configuration"
  - text: REST API Reference
    url: "#rest-api-reference"
  - text: Troubleshooting
    url: "#troubleshooting"
  - text: Security
    url: "#security"
---

# Admin Guide

This guide covers the administrative aspects of running an UrsaMU server,
including user management, configuration, backups, and troubleshooting.

## First-Run Setup

UrsaMU handles first-run setup automatically. This only needs to happen once.

### How it works

Run the server for the first time:

```bash
deno task start
```

When the database is empty, the startup script pauses and prompts you:

```
No players found in the database.
Welcome! Let's set up your superuser account.

Enter email address: you@example.com
Enter username: Admin
Enter password: ••••••••

Superuser 'Admin' created successfully!
```

After setup completes, the Hub, Telnet sidecar, and web client all start automatically.

### Permission levels

UrsaMU uses a flag-based permission system:

| Flag | Level | Who can set it | Description |
|------|-------|---------------|-------------|
| `superuser` | 10 | First-run prompt only | Full server owner access |
| `admin` | 9 | Superuser (in-game) | Full admin command access |
| `wizard` | 9 | Superuser (in-game) | Same as admin — alternative role name |
| `storyteller` | 8 | Admin (in-game) | Storytelling/moderation access |
| `builder` | 7 | Admin (in-game) | Building permissions |
| `player` | 1 | Automatic on `create` | Standard player |

From inside the game, grant admin rights with:

```
@set TheirName=admin
```

The `superuser` flag cannot be granted via `@set` — it can only be created
through the first-run interactive prompt.

> **Non-interactive environments**: If you run `deno task start` without a TTY
> (e.g. in a Docker container), the prompt is skipped. Run `deno task server`
> directly in an interactive terminal to complete first-run setup, then switch
> back to `deno task start` for normal operation.

---

## User Management

### Creating Admin Users

To grant admin privileges to an existing player, use the `@set` command as a
superuser or existing admin:

```
@set <username>=admin
```

### Managing User Accounts

As an administrator, you can manage user accounts with these commands:

- `@newpassword <user>=<password>` — Reset a user's password
- `@boot <user>` — Disconnect a player from the server
- `@toad <user>` — Convert a player object into a regular thing (removes player
  flag and disconnects)
- `@chown <object>=<player>` — Transfer ownership of an object to another player
- `@moniker <player>=<display name>` — Set a player's color-coded display name
  *(admin or wizard required)*

### User Roles and Permissions

See the [Permission levels](#permission-levels) table in the First-Run Setup
section above. In summary:

- `superuser` (10) — created at first run, cannot be granted in-game
- `admin` / `wizard` (9) — granted by a superuser with `@set`
- `storyteller` (8), `builder` (7) — granted by an admin with `@set`
- `player` (1) — automatic on character creation

To set a flag on a player:

```
@set <username>=<flag>
```

To remove a flag (prefix with `!`):

```
@set <username>=!<flag>
```

### Bulletin Board Administration

Admins and wizards can create and destroy bulletin boards:

```
+bbcreate <name>[=<description>]     -- Create a board
+bbdestroy <board>                   -- Destroy a board and all its posts
```

Board names are slugified automatically (spaces become dashes). Example:

```
+bbcreate General=General discussion board
+bbcreate Staff=Staff-only discussion
+bbdestroy general
```

The REST API exposes full board management under `/api/v1/boards` (see
the REST API section below).

### Jobs System

The jobs system lets players submit requests to staff. As staff you have
additional commands:

```
+job/assign <#>=<player>          -- Assign a job to a staff member
+job/status <#>=<status>          -- Set status (new/open/pending/in-progress/resolved/closed)
+job/priority <#>=<priority>      -- Set priority (low/normal/high/critical)
+job/complete <#>=<resolution>    -- Mark resolved with a resolution note
+job/reopen <#>                   -- Reopen a closed job
+job/staffnote <#>=<text>         -- Add a staff-only note (not visible to submitter)
+job/delete <#>                   -- Delete a job
```

Job statistics are available via the REST API at `GET /api/v1/jobs/stats`.

### Channel Administration

Admins and wizards can create, configure, and destroy communication channels:

```
@chancreate <name>[=<header>]        -- Create a channel
@chancreate/hidden <name>            -- Create a hidden channel
@chancreate/lock <name>=<expr>       -- Create a channel with a lock
@chandestroy <name>                  -- Destroy a channel
@chanset <name>/header=<text>        -- Change a channel's header
@chanset <name>/lock=<expr>          -- Set a lock expression
@chanset <name>/hidden=true|false    -- Toggle channel visibility
@chanset <name>/masking=true|false   -- Toggle name masking
```

### Rate Limiting

The server enforces a WebSocket command rate limit of **10 commands per second**
per connection. Requests that exceed this are silently dropped and logged to
stderr:

```
[WS] Rate limit hit for socket <id> (cid: <player-id>)
```

This is a fixed limit defined in `WebSocketService` and cannot currently be
configured at runtime.

## Web Client

UrsaMU ships with an optional browser-based client built with Deno Fresh
(`src/web-client/`). When `src/web-client/` is present, **`deno task start`
starts it automatically** alongside the Hub and Telnet sidecar.

The web client runs at [http://localhost:8000](http://localhost:8000).

### What the Web Client Provides

- Login / character registration forms
- In-game terminal interface (sends/receives WebSocket commands)
- Scene viewer and scene builder
- Character profile and character sheet pages
- Player directory
- Wiki pages

### Starting Manually

If you want to run the web client independently (e.g. during development):

```bash
cd src/web-client
deno task start
```

### Production Deployment

For production, build the Fresh app first:

```bash
cd src/web-client
deno task build
deno task preview    # runs the pre-built version
```

Point a reverse proxy (nginx, Caddy) at port `8000` for TLS termination. The
main Hub (port `4203`) should also be proxied for WebSocket connections from
the web client.

---

## Server Configuration

### Basic Configuration

Run the interactive configuration wizard:

```bash
deno task config
```

Key configuration areas:

- Server ports (Hub WS: 4202, Hub HTTP: 4203, Telnet: 4201, Web client: 8000)
- Game name and welcome messages
- Starting room ID

### Restarting and Shutting Down

From in-game (admin or wizard required):

```
@reboot      -- Gracefully restart the server
@shutdown    -- Shut down the server
```

From the terminal, use `Ctrl+C` to stop a running process, then restart with:

```bash
deno task server    # Hub only
deno task start     # Hub + telnet with file watching
```

## Scene Management

Scenes are collaborative roleplay logs. They can be exported via the HTTP API.

### Exporting a Scene

```
GET /api/v1/scenes/:id/export
```

Optional query parameter:

| `format` | Result |
|----------|--------|
| `markdown` *(default)* | A formatted Markdown log with poses and participant list |
| `json` | Full scene object as JSON |

Example with `curl`:

```bash
# Markdown log
curl -H "Authorization: Bearer <token>" \
     https://yourgame.example.com/api/v1/scenes/42/export

# Raw JSON
curl -H "Authorization: Bearer <token>" \
     https://yourgame.example.com/api/v1/scenes/42/export?format=json
```

## REST API Reference

All endpoints are served on the Hub's HTTP port (default `4203`). Most require
a `Bearer` JWT token in the `Authorization` header, obtained from
`POST /api/v1/auth/login`.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/login` | Returns `{ token }` |
| `POST` | `/api/v1/auth/register` | Create a new character |
| `GET` | `/api/v1/me` | Current user profile |

### Players

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/players/online` | List connected players |
| `GET` | `/api/v1/channels` | List channels |

### Bulletin Boards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/boards` | All boards with post + unread counts |
| `POST` | `/api/v1/boards` | Create a board *(staff)* |
| `GET` | `/api/v1/boards/unread` | Unread summary across all boards |
| `GET` | `/api/v1/boards/:id` | Single board |
| `PATCH` | `/api/v1/boards/:id` | Update board *(staff)* |
| `DELETE` | `/api/v1/boards/:id` | Delete board + all posts *(staff)* |
| `GET` | `/api/v1/boards/:id/posts` | Paginated post list (`limit`, `offset`) |
| `POST` | `/api/v1/boards/:id/posts` | Create a post |
| `GET` | `/api/v1/boards/:id/posts/:num` | Read a post |
| `PATCH` | `/api/v1/boards/:id/posts/:num` | Edit a post *(author or staff)* |
| `DELETE` | `/api/v1/boards/:id/posts/:num` | Delete a post *(author or staff)* |
| `POST` | `/api/v1/boards/:id/read` | Mark board as read |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/jobs` | List jobs (staff see all; players see their own) |
| `POST` | `/api/v1/jobs` | Submit a job |
| `GET` | `/api/v1/jobs/stats` | Counts by status, category, priority *(staff)* |
| `GET` | `/api/v1/jobs/:id` | Get a job by number or ID |
| `PATCH` | `/api/v1/jobs/:id` | Update status/priority/assignee *(staff)* |
| `DELETE` | `/api/v1/jobs/:id` | Delete a job *(staff)* |
| `POST` | `/api/v1/jobs/:id/comment` | Add a comment |

### Scenes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/scenes` | List scenes |
| `GET` | `/api/v1/scenes/:id/export` | Export as `?format=markdown` or `?format=json` |

### WebSocket

Connect via `ws://host:4202` (or the Hub port). Authenticate either by
sending `connect <name> <password>` as your first message, or by passing a
JWT at connection time:

```
ws://host:4203?token=<jwt>&client=web
```

The `client=web` parameter enables rich JSON payloads instead of plain text.

---

## Troubleshooting

### Common Issues

#### Server Won't Start

- Check if a port is already in use (`4201`, `4202`, `4203`, or `8000`)
- Ensure Deno is installed and up to date (`deno upgrade`)
- Check for errors in configuration output (`deno task config`)

#### Player Can't Connect

- Confirm the Hub is running (`deno task server`)
- For Telnet clients, confirm the Telnet sidecar is running (`deno task telnet`)
- For the web client, confirm it is running (`deno task start` in
  `src/web-client/`)

#### Permission Denied Errors

- Verify the player has the correct flags set (`@set <player>=admin`)
- The `wizard` flag can only be set by a superuser at the database level

### Logs

UrsaMU logs to stdout/stderr. Redirect output to a file if you need persistent
logs:

```bash
deno task server > logs/server.log 2>&1
```

## Security

### Securing Your Server

- Place the Hub behind a reverse proxy (e.g., nginx) for TLS termination
- Set up a firewall to limit external access to only the necessary ports
- Keep Deno and dependencies updated
- Use strong passwords — the `auth.hash` SDK method uses bcrypt

### The `wizard` Flag

The `wizard` flag is locked to **superuser** level and cannot be granted by
regular admins. It is intended for server owners who need a permanent,
unforgeable high-privilege account. Set it directly at the database level during
initial setup.
