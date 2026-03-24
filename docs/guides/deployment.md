---
layout: layout.vto
title: Production Deployment
description: How to run UrsaMU in production — environment setup, daemon management, nginx reverse proxy, TLS, and updates.
---

# Production Deployment

This guide covers running UrsaMU on a Linux VPS or dedicated server. The
examples use Ubuntu/Debian and nginx, but the approach works on any Linux
distribution.
---

## Before You Start

You need:

- **Deno** — [deno.land](https://deno.land/) v1.40+
- A **domain name** pointed at your server's IP (for TLS)
- Ports `4201`, `4203` reachable from the internet (or whatever you configure)
- A strong value ready for `JWT_SECRET`

Install Deno if you haven't:

```bash
curl -fsSL https://deno.land/install.sh | sh
# Add to PATH — follow the printed instructions, then:
source ~/.bashrc
```
---

## Environment Variables

Set these before starting the server. The simplest approach is a `.env` file in
your game project root (UrsaMU loads it via `@std/dotenv` at startup):

```bash
# .env  — DO NOT commit this file
JWT_SECRET=replace-this-with-a-long-random-string
```

Generate a strong secret:

```bash
openssl rand -base64 48
```

> **Why this matters:** If `JWT_SECRET` is not set, a random secret is
> generated at startup — meaning every restart logs all players out. Set it
> once and keep it stable.

You can also override the default ports via environment variables:

```bash
URSAMU_HTTP_PORT=4203    # HTTP + WebSocket hub (default: 4203)
URSAMU_TELNET_PORT=4201  # Telnet sidecar (default: 4201)
```

Or set ports in your game's `config/config.json`:

```json
{
  "server": {
    "http": 4203,
    "telnet": 4201,
    "ws": 4202
  }
}
```
---

## First Run

On a fresh server with an empty database, start the server interactively once
to complete first-run setup:

```bash
deno task server
```

The server prints:

```
Fresh database detected — no players exist yet.

Connect via telnet and run:
  create <name> <password>

The first player created is automatically given superuser access.
```

Connect with a telnet client (`telnet localhost 4201`) and create your account.
The first player created receives the `superuser` flag automatically.

After that, switch to daemon mode for normal operation.
---

## Daemon Mode

UrsaMU includes built-in daemon scripts that start both processes in the
background, write logs to `logs/`, and track PIDs.

```bash
# Start in background
deno task daemon

# Check status
deno task status

# Follow live logs
deno task logs

# Stop
deno task stop

# Stop and restart
deno task restart
```

**What `deno task daemon` does:**

1. Starts `src/telnet.ts` in the background → logs to `logs/telnet.log`
2. Starts `src/main.ts` in the background → logs to `logs/main.log`
3. Writes PIDs to `.ursamu.pid`

The PIDs file is cleaned up automatically on `deno task stop`.

> **Development vs production:** Use `deno task start` during development — it
> enables file watching so both servers restart on code changes. Use
> `deno task daemon` in production where you want the servers to stay up
> without reloading on filesystem events.
---

## systemd

For tighter OS integration (automatic restart on crash, start on boot), run
UrsaMU as a systemd service instead of using the daemon scripts.

Create `/etc/systemd/system/ursamu-main.service`:

```ini
[Unit]
Description=UrsaMU Main Server
After=network.target
Wants=ursamu-telnet.service

[Service]
Type=simple
User=ursamu
WorkingDirectory=/home/ursamu/my-game
EnvironmentFile=/home/ursamu/my-game/.env
ExecStart=/home/ursamu/.deno/bin/deno run --allow-all --unstable-detect-cjs --unstable-kv src/main.ts
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/ursamu/my-game/logs/main.log
StandardError=append:/home/ursamu/my-game/logs/main.log

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/ursamu-telnet.service`:

```ini
[Unit]
Description=UrsaMU Telnet Sidecar
After=network.target

[Service]
Type=simple
User=ursamu
WorkingDirectory=/home/ursamu/my-game
EnvironmentFile=/home/ursamu/my-game/.env
ExecStart=/home/ursamu/.deno/bin/deno run --allow-all --unstable-detect-cjs --unstable-kv src/telnet.ts
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/ursamu/my-game/logs/telnet.log
StandardError=append:/home/ursamu/my-game/logs/telnet.log

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ursamu-main ursamu-telnet
sudo systemctl start ursamu-main ursamu-telnet
sudo systemctl status ursamu-main ursamu-telnet
```

Adjust `User`, `WorkingDirectory`, and `EnvironmentFile` paths to match your
setup. Run UrsaMU as a dedicated non-root user — create one with:

```bash
sudo useradd -m -s /bin/bash ursamu
```
---

## Nginx and TLS

Place nginx in front of the Hub to terminate TLS. This lets your game use
`wss://` (secure WebSocket) and `https://` without modifying UrsaMU itself.

### Install nginx and Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d yourgame.example.com
```

### nginx configuration

Create `/etc/nginx/sites-available/ursamu`:

```nginx
server {
    listen 443 ssl http2;
    server_name yourgame.example.com;

    ssl_certificate     /etc/letsencrypt/live/yourgame.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourgame.example.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # HTTP REST API
    location /api/ {
        proxy_pass         http://127.0.0.1:4203;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:4203;
    }

    # WebSocket
    location /ws {
        proxy_pass         http://127.0.0.1:4203;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name yourgame.example.com;
    return 301 https://$host$request_uri;
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/ursamu /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### WebSocket connection URL with TLS

Clients connecting through the nginx proxy use:

```
wss://yourgame.example.com/ws?token=<jwt>&client=web
```

The proxy forwards the WebSocket upgrade to port 4203. The `X-Forwarded-For`
header is passed through, so brute-force rate limiting still sees the real
client IP.

### Telnet and TLS

Standard Telnet (`telnet:4201`) does not support TLS. For encrypted Telnet
connections, clients should use a TLS-capable MU* client (e.g. Mudlet with SSL
enabled) pointed directly at port 4201, with nginx/stunnel wrapping that port.
Most game operators leave Telnet unencrypted and direct players to use the
WebSocket connection for sensitive operations.
---

## Firewall

Open only the ports you need. With nginx handling TLS:

```bash
# UFW example
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (nginx, for redirect + Certbot)
sudo ufw allow 443/tcp   # HTTPS (nginx)
sudo ufw allow 4201/tcp  # Telnet (direct)
sudo ufw enable
```

Port `4203` should **not** be exposed directly — all HTTP/WS traffic should
flow through nginx on 443. Only Telnet needs a public port of its own.
---

## Logs

UrsaMU writes three log files to `logs/`:

| File | Contents |
|------|---------|
| `logs/main.log` | Hub stdout/stderr — server events, errors |
| `logs/telnet.log` | Telnet sidecar stdout/stderr |
| `logs/error.log` | Unhandled errors logged by `logError()` |
| `logs/security.log` | Auth events — login failures, resets, admin actions |

Follow live:

```bash
deno task logs          # tails main.log and telnet.log
tail -f logs/security.log
```

### Log rotation

Prevent unbounded growth with `logrotate`. Create
`/etc/logrotate.d/ursamu`:

```
/home/ursamu/my-game/logs/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
```

`copytruncate` truncates the file in place rather than moving it, so the
running server keeps writing without needing a restart.
---

## Updates

UrsaMU is a JSR package — your game project depends on a version pinned in
`deno.json`. To update to the latest engine:

```bash
# Preview what would change
deno run -A jsr:@ursamu/ursamu/cli update --dry-run

# Apply the update
deno run -A jsr:@ursamu/ursamu/cli update
```

After updating, restart the servers:

```bash
deno task restart           # if using daemon mode
sudo systemctl restart ursamu-main ursamu-telnet  # if using systemd
```

Check the [changelog](https://github.com/ursamu/ursamu/releases) before
updating on a live game to catch any breaking changes.
