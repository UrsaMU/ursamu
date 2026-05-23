---
layout: layout.vto
title: Docker
description: Running UrsaMU with Docker and Docker Compose.
---

# Docker

UrsaMU ships a `Dockerfile` and `docker-compose.yaml` for containerized deployments.
Docker is the recommended way to run UrsaMU in production on any VPS or cloud host.
---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2 (ships with Docker Desktop)

---

## Quick Start

```bash
# Clone the repo (or use your game project)
git clone https://github.com/UrsaMU/ursamu.git
cd ursamu

# Create your .env file
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env

# Build and start
docker compose up -d

# Watch the logs
docker compose logs -f
```

On first startup the server initializes the database and prints a one-time
message inviting you to create the first player via Telnet:

```
Fresh database detected — no players exist yet.

Connect via telnet and run:
  create <name> <password>

The first player created is automatically given superuser access.
```

Connect with `telnet localhost 4201` and run `create <name> <password>` —
that first account is granted the `superuser` flag automatically. After
that, all subsequent `create` calls produce regular players.

---

## Ports

| Container port | Host port | Protocol | Purpose |
|----------------|-----------|----------|---------|
| `4201` | `4201` | Telnet | Legacy MU* clients |
| `4202` | `4202` | WebSocket | Raw WebSocket connections |
| `4203` | `4203` | HTTP / WS | REST API + JWT WebSocket |

Connect with a Telnet client:

```bash
telnet localhost 4201
```

Or point a web client at:

```
ws://localhost:4203?token=<jwt>&client=web
```

---

## docker-compose.yaml

The file is included in the project root. Full contents for reference:

```yaml
services:
  ursamu:
    build: .
    ports:
      - "4201:4201"
      - "4202:4202"
      - "4203:4203"
    volumes:
      - ./data:/app/data       # Deno KV database files
      - ./config:/app/config   # config.json
      - ./logs:/app/logs       # main.log, telnet.log, error.log
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
```

### Volumes

| Mount | Purpose |
|-------|---------|
| `./data:/app/data` | Deno KV database — **must be persisted** or data is lost on container restart |
| `./config:/app/config` | `config.json` — edit game settings without rebuilding |
| `./logs:/app/logs` | Server logs — useful for debugging and monitoring |

---

## Environment Variables

Create a `.env` file in the project root before starting:

```bash
# Required — long random string; changing this logs out all players
JWT_SECRET=replace-with-a-long-random-string

# Optional overrides
URSAMU_HTTP_PORT=4203
URSAMU_TELNET_PORT=4201
```

Generate a secure secret:

```bash
openssl rand -hex 32
```

---

## Configuration

Edit `config/config.json` to change game settings — the volume mount means
changes take effect on the next restart with no image rebuild needed:

```json
{
  "server": {
    "telnet": 4201,
    "ws": 4202,
    "http": 4203,
    "db": "data/ursamu.db"
  },
  "game": {
    "name": "My Game",
    "description": "A UrsaMU-powered MUSH.",
    "version": "0.0.1",
    "playerStart": "1"
  }
}
```

---

## Common Commands

```bash
# Start (detached)
docker compose up -d

# Stop
docker compose down

# Restart
docker compose restart

# Tail logs
docker compose logs -f

# Rebuild after code changes
docker compose up -d --build

# Open a shell in the running container
docker compose exec ursamu sh

# Inspect the database volume
ls ./data/
```

---

## Changing Ports

To run on different host ports (e.g. behind a firewall that blocks 4201), edit
the `ports` section in `docker-compose.yaml`:

```yaml
ports:
  - "2323:4201"   # expose Telnet on host port 2323
  - "4202:4202"
  - "443:4203"    # expose HTTP/WS directly on 443 (no nginx needed)
```

The container-internal ports (`4201`, `4202`, `4203`) stay the same —
only the host-side mappings change.

---

## Behind a Reverse Proxy

For TLS termination with nginx, expose only port `4203` to nginx and keep
`4201` open directly for Telnet clients:

```yaml
ports:
  - "4201:4201"     # Telnet — direct
  # 4202 and 4203 not exposed; nginx handles 443 → 4203
```

nginx config:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4203;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Updating

```bash
# Pull latest image / rebuild
git pull
docker compose up -d --build
```

Or trigger an in-game update from the admin prompt:

```
@update
```

This runs `git pull` inside the container and restarts the server process.
The container itself stays running.

---

## Troubleshooting

### Container exits immediately

Check the logs:

```bash
docker compose logs ursamu
```

Common causes:
- **`JWT_SECRET` not set** — the server will warn but continue; check logs for
  `[security] JWT_SECRET not set` and add it to `.env`
- **Port already in use** — another process is listening on `4201`, `4202`, or
  `4203`. Stop it or remap the port.
- **Missing config** — `config/config.json` not found. Copy `config.sample.json`
  to `config/config.json`.

### Data lost after restart

Make sure the `./data` directory exists and is mounted:

```bash
mkdir -p data logs
docker compose up -d
```

If the volume is missing from `docker-compose.yaml`, data is written inside the
container and lost on every `down`.

### Can't connect on Telnet

Verify the container is running and the port is mapped:

```bash
docker compose ps
docker compose port ursamu 4201
```

If running behind a firewall, open port `4201`:

```bash
# UFW
sudo ufw allow 4201/tcp
```

### Permission errors on ./data or ./logs

```bash
chmod 777 data logs
```
