---
layout: layout.vto
title: Admin Guide
description: Learn how to administer an UrsaMU server
nav:
  - text: First-Run Setup
    url: "#first-run-setup"
  - text: User Management
    url: "#user-management"
  - text: Server Configuration
    url: "#server-configuration"
  - text: REST API Reference
    url: "#rest-api-reference"
  - text: Troubleshooting
    url: "#troubleshooting"
  - text: Password Reset
    url: "#password-reset"
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

After setup completes, the Hub and Telnet sidecar start automatically.

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

> **Non-interactive environments**: If you run `deno task start` without a TTY,
> the prompt is skipped. Run `deno task server` directly in an interactive
> terminal to complete first-run setup, then switch back to `deno task start`
> for normal operation.

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

- `@newpassword <user>=<password>` — Reset a user's password directly
- `@resettoken <user>` — Generate a one-time password-reset token (valid 1 hour);
  give the token to the player so they can reset via `POST /api/v1/auth/reset-password`
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

## Server Configuration

### Basic Configuration

Run the interactive configuration wizard:

```bash
deno task config
```

Key configuration areas:

- Server ports (Hub WS: 4202, Hub HTTP: 4203, Telnet: 4201)
- Game name and welcome messages
- Starting room ID

### Runtime Configuration (`@site`)

Admins and wizards can change a subset of server configuration values at runtime
without restarting:

```
@site server.name=My Awesome Game
@site game.loginMessage=Welcome back!
@site game.welcomeMessage=Welcome to the game!
@site server.banner=A roleplay game set in urban fantasy
```

Allowed keys: `server.name`, `server.description`, `server.banner`,
`server.corsOrigins`, `server.maxConnections`, `game.maxPlayers`,
`game.description`, `game.loginMessage`, `game.welcomeMessage`.

Attempts to set other keys (e.g. `server.db`, `jwt.secret`) are blocked and
logged to the security log.

### Restarting and Shutting Down

From in-game (admin or wizard required):

```
@reboot      -- Gracefully restart the server
@shutdown    -- Shut down the server
@update      -- Pull latest code from git and restart (see below)
```

From the terminal, use `Ctrl+C` to stop a running process, then restart with:

```bash
deno task start     # Hub only (no watch)
deno task dev       # Hub + Telnet with file watching (development)
deno task daemon    # Background service with restart loop (production)
```

### Hot-Reload (`@reload`)

Without restarting or disconnecting any players, admins and wizards can reload
individual parts of the running server:

```
@reload                    -- reload everything (config + text + commands + plugins)
@reload/config             -- reload config.json from disk only
@reload/text               -- reload text files (motd, etc.) only
@reload/cmds               -- reload native commands and system aliases only
@reload/plugins            -- hot-reload all installed plugins
@reload/plugin <name>      -- hot-reload one specific plugin by name
```

**Example — reload just the jobs plugin after an update:**

```
@reload/plugin jobs
```

The response shows each subsystem's status. Partial failures are reported
inline so you can see which component (if any) didn't reload cleanly.

> `@reload/plugin <name>` is case-insensitive and matches against the plugin's
> registered name. To see what's loaded: `@reload/plugin` (no name) prints
> the list of currently loaded plugins.

> **System scripts** (`system/scripts/*.ts`) are always executed live — the
> engine reads and compiles them on each invocation — so they never need a
> reload.

### Updating from Git (`@update`)

Admins and wizards can update the running server from in-game without touching
the terminal:

```
@update              -- git pull from the default branch (origin/main)
@update main         -- pull a specific branch
@upgrade             -- alias for @update
```

The command:
1. Broadcasts `%chGame>%cn Updating from git...` to all connected players
2. Runs `git pull origin <branch>`
3. Exits with code 75, which tells the daemon restart loop to reboot the server

> Telnet connections survive the reboot — the Telnet sidecar stays up and
> reconnects to the Hub automatically.

### Daemon Restart Loop

When started via `bash scripts/daemon.sh`, the server runs inside a restart
loop (`scripts/main-loop.sh`) that watches the process exit code:

| Exit code | Meaning | Action |
|-----------|---------|--------|
| `75` | Restart signal (`@reboot`, `@update`) | Restart after delay |
| `0` | Clean shutdown (`@shutdown`) | Stop — do not restart |
| Other | Unexpected crash | Stop — check logs |

**Rapid-restart protection** — if the server exits in under 5 seconds the
restart delay doubles (1 s → 2 s → 4 s → … capped at 60 s). A stable
long-running restart resets the delay back to 1 second.

The deno child PID is written to `.ursamu-deno.pid`; the loop PID is in
`.ursamu.pid`. Use `bash scripts/stop.sh` to gracefully stop both.

## Wiki Administration

The wiki plugin stores articles as Markdown files in `./wiki/` with a
folder-driven URL structure. Admins and wizards manage pages with `@wiki`
in-game commands.

### In-game wiki commands

```
@wiki/create <path>=<title>/<body>
  -- Create a new wiki page. Path mirrors the folder structure.
  -- Example: @wiki/create news/patch-notes=Patch Notes/Details here...

@wiki/edit <path>=<new body>
  -- Replace the body of an existing page (frontmatter is preserved).
  -- Example: @wiki/edit news/patch-notes=Updated content here.

@wiki/fetch <url>=<wiki-path>
  -- Download an image or PDF from a public URL into the wiki folder.
  -- Example: @wiki/fetch https://example.com/map.png=maps/world.png
  -- Allowed types: .jpg .jpeg .png .gif .webp .svg .pdf (max 10 MB)
```

> **Security note:** `@wiki/fetch` blocks private/loopback/link-local IP
> ranges (localhost, 127.x, 10.x, 192.168.x, etc.) to prevent SSRF attacks.
> Only publicly routable URLs are permitted.

### Wiki REST API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/wiki` | Required | List all pages (title + path) |
| `GET` | `/api/v1/wiki?q=<query>` | Required | Full-text search (title, body, tags) |
| `GET` | `/api/v1/wiki/<path>` | Required | Read a page or list a directory |
| `GET` | `/api/v1/wiki/<path.ext>` | Required | Serve a static asset (image, PDF) |
| `POST` | `/api/v1/wiki` | Staff | Create a page |
| `PATCH` | `/api/v1/wiki/<path>` | Staff | Update body and/or frontmatter |
| `DELETE` | `/api/v1/wiki/<path>` | Staff | Delete a page or asset |
| `PUT` | `/api/v1/wiki/<path.ext>` | Staff | Upload a static asset (binary) |

**Example — create a page:**

```bash
curl -X POST https://yourgame.example.com/api/v1/wiki \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "news/patch-notes",
    "title": "Patch Notes",
    "date": "2026-03-18",
    "body": "## Changes\n- Added new location."
  }'
```

**Wiki page frontmatter format:**

```yaml
---
title: My Page Title
date: 2026-03-18
author: Admin
tags: [news, update]
---

Page body in Markdown here.
```

All metadata keys must match `/^[\w-]+$/`. Body size limit is **10 MB**.

---

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
| `POST` | `/api/v1/auth/reset-password` | Consume a reset token and set a new password |
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
| `POST` | `/api/v1/scenes` | Create a scene |
| `GET` | `/api/v1/scenes/locations` | List accessible rooms |
| `GET` | `/api/v1/scenes/:id` | Scene detail |
| `PATCH` | `/api/v1/scenes/:id` | Update name, desc, status, sceneType |
| `POST` | `/api/v1/scenes/:id/pose` | Add a pose/ooc/set entry |
| `PATCH` | `/api/v1/scenes/:id/pose/:poseId` | Edit a pose |
| `POST` | `/api/v1/scenes/:id/join` | Join a scene |
| `POST` | `/api/v1/scenes/:id/invite` | Invite a player |
| `GET` | `/api/v1/scenes/:id/export` | Export as `?format=markdown` or `?format=json` |

### Wiki

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/wiki` | List all pages |
| `GET` | `/api/v1/wiki?q=<query>` | Full-text search |
| `GET` | `/api/v1/wiki/<path>` | Read page or directory listing |
| `GET` | `/api/v1/wiki/<path.ext>` | Serve static asset |
| `POST` | `/api/v1/wiki` | Create page *(staff)* |
| `PATCH` | `/api/v1/wiki/<path>` | Update page *(staff)* |
| `DELETE` | `/api/v1/wiki/<path>` | Delete page or asset *(staff)* |
| `PUT` | `/api/v1/wiki/<path.ext>` | Upload static asset *(staff)* |

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

- Check if a port is already in use (`4201`, `4202`, `4203`)
- Ensure Deno is installed and up to date (`deno upgrade`)
- Check for errors in configuration output (`deno task config`)

#### Player Can't Connect

- Confirm the Hub is running (`deno task server`)
- For Telnet clients, confirm the Telnet sidecar is running (`deno task telnet`)

#### Permission Denied Errors

- Verify the player has the correct flags set (`@set <player>=admin`)
- The `wizard` flag can only be granted by a **superuser** (`@set <player>=wizard`)

### Logs

UrsaMU logs to stdout/stderr. Redirect output to a file if you need persistent
logs:

```bash
deno task server > logs/server.log 2>&1
```

## Password Reset

See the full [Password Reset guide](./password-reset.md) for the step-by-step
flow. In brief:

1. Run `@resettoken <player>` in-game — a UUID token is printed to your session
2. Pass the token to the player out-of-band (Discord, email, etc.)
3. The player calls `POST /api/v1/auth/reset-password` with `{ token, newPassword }`
4. The token is single-use and expires after **1 hour**

---

## Security

### Securing Your Server

- Place the Hub behind a reverse proxy (e.g., nginx, Caddy) for TLS termination
- Set up a firewall to limit external access to only the necessary ports (`4201`, `4202`, `4203`)
- Keep Deno and dependencies updated
- Set a strong `JWT_SECRET` environment variable before starting (see below)
- Use strong passwords — the `auth.hash` SDK method uses bcrypt

### JWT Secret

UrsaMU signs session tokens with a secret key. Set it via environment variable
before starting the server:

```bash
export JWT_SECRET="your-long-random-secret-here"
deno task start
```

If `JWT_SECRET` is not set, a random secret is generated at startup and a
warning is printed. This means all sessions are invalidated on restart.

### Brute-Force Login Protection

The login endpoint (`POST /api/v1/auth/login`) enforces a per-IP rate limit of
**10 failed attempts per minute**. After that threshold is reached the server
returns `429 Too Many Requests` and logs the event to `logs/security.log`.

### Security Headers

All HTTP responses include hardening headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Security Logging

Security events are written to `logs/security.log`:

- `LOGIN_FAILED` — wrong password
- `LOGIN_RATE_LIMITED` — IP blocked after too many failures
- `PASSWORD_RESET` — password reset token consumed
- `ADMIN_BOOT`, `ADMIN_TOAD`, `ADMIN_NEWPASSWORD` — admin user management actions
- `ADMIN_SITE_SET`, `ADMIN_SITE_BLOCKED` — `@site` command activity
- `ADMIN_RESETTOKEN` — reset token generation

### The `wizard` Flag

The `wizard` flag sits at the same permission level as `admin` (level 9) but
can only be granted by a **superuser**. Regular admins cannot elevate another
player to wizard. Grant it with:

```
@set <player>=wizard
```
