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
  - text: Troubleshooting
    url: "#troubleshooting"
  - text: Security
    url: "#security"
---

# Admin Guide

This guide covers the administrative aspects of running an UrsaMU server,
including user management, configuration, backups, and troubleshooting.

## First-Run Setup

On a brand-new server, the database is empty — there are no admin accounts yet.
You need to bootstrap your first superuser account manually. This only needs to
be done once.

### Step 1 — Start the server and create your character

```bash
deno task start
```

Connect with your MU* client (port `4201`) or the web client, then:

```
create YourName YourPassword
```

Quit the game immediately after: `quit`

### Step 2 — Grant yourself wizard access

From your project directory, run:

```bash
deno run -A --unstable-kv - <<'EOF'
import { dbojs } from "jsr:@ursamu/ursamu/src/services/Database/index.ts";
const results = await dbojs.find({ "data.name": /^YourName$/i });
const player = results[0];
if (player) {
  player.flags.add("wizard");
  await dbojs.modify({ id: player.id }, "$set", { flags: player.flags });
  console.log("Wizard flag set on", player.data?.name);
} else {
  console.error("Player not found — check the name and try again");
}
EOF
```

Replace `YourName` with your character's name exactly as you created it.

### Step 3 — Reconnect

Log back in. You now have full wizard (superuser) access. From this point you can
manage everything from inside the game.

To grant admin access to another player:

```
@set TheirName=admin
```

> The `wizard` flag (superuser level) can only be set at the database level and
> cannot be granted via `@set` by any in-game command — this is intentional. Use
> `admin` for trusted staff and reserve `wizard` for server owners.

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

UrsaMU uses a flag-based permission system. The key permission flags are:

- **player** — Standard player account. Set automatically on character creation.
- **admin** — Full administrative access. Can use all admin commands, manage
  channels, set flags, and modify any object.
- **wizard** — Restricted super-admin flag (level 9). Locked to superusers only.
  Code: `wiz`. Grants the same command access as `admin` but is reserved for
  server owners. Cannot be set by regular admins.

To set a flag on a player:

```
@set <username>=<flag>
```

To remove a flag (prefix with `!`):

```
@set <username>=!<flag>
```

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

UrsaMU ships with an optional browser-based client built with Deno Fresh. It is
a separate process from the main Hub and must be started independently.

### Starting the Web Client

```bash
cd src/web-client
deno task start
```

The web client runs at [http://localhost:8000](http://localhost:8000).

### What the Web Client Provides

- Login / character registration forms
- In-game terminal interface (sends/receives WebSocket commands)
- Scene viewer and scene builder
- Character profile and character sheet pages
- Player directory
- Wiki pages

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
