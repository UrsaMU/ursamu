# UrsaMU

### The Next-Generation MU* Engine

![ursamu header](https://raw.githubusercontent.com/ursamu/ursamu/main/ursamu_github_banner.png)

UrsaMU is a modern, high-performance MUSH-like server built with **TypeScript** and **Deno**.

---

## ⚡ Quick Start

> [!TIP]
> **No install required!** Run the CLI directly from JSR.

```bash
# Create a new game project
deno run -A jsr:@ursamu/ursamu/cli create my-game

# Scaffold a plugin inside an existing project
deno run -A jsr:@ursamu/ursamu/cli create plugin my-feature
```

**Prerequisites:** [Deno](https://deno.land) must be installed.

```bash
# Mac / Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex
```

---

## ✨ Features

- **Plugin ecosystem** — drop a folder in `src/plugins/` and commands, REST routes, and a private DB namespace register automatically
- **Sandbox scripting** — scripts run in isolated Web Workers with full SDK access (`u.db`, `u.chan`, `u.mail`, `u.events`, …)
- **REST API** — every built-in system exposes clean JSON endpoints; plugins add their own versioned routes
- **WebSocket auth** — connect via `ws://host:4203?token=<jwt>&client=web` for JWT pre-auth, no `connect name password` needed
- **Tiered permissions** — flag-based access control from `player` up through `builder`, `admin`, `wizard`, and `superuser`
- **Zero external dependencies** — Deno KV for persistence, no database to install or configure

---

## 🧩 Official Plugins

Auto-installed via `src/plugins/plugins.manifest.json`:

| Plugin | Description |
|--------|-------------|
| **channel** | Channel system with aliases, history, and admin tools |
| **rhost-vision** | Rhost-style `look`, `who`, `score`, `+finger`, `+staff` |
| **discord** | Webhook-based Discord bridge — channels, presence |
| **jobs** | Anomaly-style jobs/request system with REST API |
| **events** | In-game event calendar with RSVP and REST API |
| **bbs** | Myrddin-style bulletin boards |
| **mail** | Full in-game mail system with REST API |
| **builder** | World-building commands and REST API |
| **wiki** | Markdown wiki with search and history |

→ [Full plugin details](docs/plugins/official-plugins.md)

---

## 📚 Documentation

| Topic | Link |
|-------|------|
| Installation | [docs/guides/installation.md](docs/guides/installation.md) |
| In-game commands | [docs/guides/commands.md](docs/guides/commands.md) |
| REST API | [docs/api/rest.md](docs/api/rest.md) |
| CLI reference | [docs/guides/cli.md](docs/guides/cli.md) |
| Plugin development | [docs/plugins/index.md](docs/plugins/index.md) |
| Admin guide | [docs/guides/admin-guide.md](docs/guides/admin-guide.md) |
| User guide | [docs/guides/user-guide.md](docs/guides/user-guide.md) |
| Architecture | [docs/about.md](docs/about.md) |
| API reference | [docs/api/index.md](docs/api/index.md) |

---

## 📜 License

UrsaMU is licensed under the **MIT License**.

---

> [!TIP]
> Pull requests are welcome! For major changes, please open an issue first to discuss your ideas.
