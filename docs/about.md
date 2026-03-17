---
layout: layout.vto
title: About UrsaMU
description: What is UrsaMU, how it works, and what makes it different from other MU* servers.
---

# About UrsaMU

UrsaMU is an open-source, high-performance **MU\* (MUSH/MUX/MOO-style) game server** built from the ground up with modern tools — TypeScript and Deno — instead of the decades-old C codebases that traditional text-based game servers rely on.

It is designed for **game operators and developers** who want to run text-based collaborative fiction worlds without fighting ancient technology.

## What is a MUSH?

MUSH stands for **Multi-User Shared Hallucination** — a genre of text-based online games where players create characters, inhabit virtual rooms, communicate with each other, and together build persistent interactive stories.

Unlike MMORPGs with graphics and combat systems, a MUSH is:

- **Text-based**: all interaction happens through typed commands
- **Collaborative**: players write scenes, roleplay stories, and build worlds together
- **Scriptable**: the game world itself can be programmed using in-game languages
- **Social**: designed around conversation, storytelling, and community

MUSH-style games have existed since the late 1980s and remain active communities today for tabletop RPG adaptation, fan fiction, original fiction, and creative writing.

## Why UrsaMU?

Existing MU* servers (TinyMUSH, PennMUSH, RhostMUSH, MUX2) are written in C, first authored in the 1990s, and carry decades of technical debt. They are difficult to extend, deploy, and maintain.

UrsaMU takes a fresh approach:

| Traditional MU* | UrsaMU |
|----------------|--------|
| Written in C | Written in TypeScript |
| No standard package system | Deno native (JSR, npm imports) |
| Telnet-only | WebSocket primary, Telnet sidecar |
| Embedded scripting in MUSHcode | Scripts run in sandboxed Web Workers |
| Modify core to extend | Plugin architecture |
| Manual compile & deploy | `deno task start` |

## Core Features

### WebSocket-Native Protocol

The primary interface to UrsaMU is **WebSocket**, not Telnet. This means:

- Native browser connectivity — build web clients without proxies
- Structured JSON messages for clean client/server contracts
- A Telnet sidecar is still available for classic MU* clients

```javascript
const socket = new WebSocket("ws://yourgame.example.com:4202");

socket.send(JSON.stringify({ msg: "look", data: {} }));
socket.send(JSON.stringify({ msg: "connect PlayerName Password", data: {} }));
```

### Sandboxed Script Engine

Game scripts (for commands, objects, and automation) run in **Web Workers**, completely isolated from the host process. Scripts:

- Cannot crash the server
- Cannot access the filesystem or network directly
- Communicate through a typed SDK message protocol
- Support ESM `import` syntax for library reuse

```typescript
// A sample script that greets the room
const here = await u.db.get(en.location);
u.emit.send(`${en.name} waves hello to ${here.name}.`);
u.emit.broadcast(here.id, `${en.name} waves hello!`);
```

### Plugin Architecture

Everything in UrsaMU is extensible via plugins:

```typescript
import { addCmd } from "jsr:@ursamu/ursamu";
import type { IPlugin, IUrsamuSDK } from "jsr:@ursamu/ursamu";

const myPlugin: IPlugin = {
  name: "my-game-plugin",
  version: "1.0.0",
  init: async () => {
    addCmd({
      name: "greet",
      pattern: /^greet\s*(.*)/i,
      lock: "connected",
      exec: (u: IUrsamuSDK) => u.send(`Hello, ${u.cmd.args[0]?.trim() ?? "world"}!`),
    });
    return true;
  },
};

export default myPlugin;
```

### Discord Integration

An optional built-in Discord bridge relays game communication to Discord channels and back. Features exponential-backoff reconnection and idempotent initialization — no duplicate event listeners on restart.

### Scene Tracking & Export

UrsaMU tracks **roleplay scenes** — collaborative writing sessions between players. Scenes can be archived via the REST API:

```bash
# Export a scene as formatted Markdown
GET /api/v1/scenes/:id/export?format=markdown

# Export as raw JSON
GET /api/v1/scenes/:id/export?format=json
```

### Rate Limiting

The WebSocket hub enforces **10 commands per second** per connection. Excess commands are silently dropped and logged — protecting the server from runaway clients.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Clients                                                          │
│  Browser WebSocket  ─┐                                           │
│  MU* Client (Telnet) ─┤── Telnet Sidecar ─┐                     │
│  Discord ─────────────┘                   │                     │
└───────────────────────────────────────────┼─────────────────────┘
                                            │
┌───────────────────────────────────────────▼─────────────────────┐
│  UrsaMU Hub (Deno process)                                       │
│                                                                   │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ WebSocket  │  │  HTTP REST   │  │  Discord Bridge        │  │
│  │ Service    │  │  (Hono/Oak)  │  │  (Gateway reconnect)   │  │
│  └─────┬──────┘  └──────┬───────┘  └────────────────────────┘  │
│        │                │                                         │
│  ┌─────▼────────────────▼──────────────────────────┐            │
│  │  Command Parser / Middleware Pipeline            │            │
│  └─────────────────────────┬───────────────────────┘            │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────┐            │
│  │  Sandbox Service                                 │            │
│  │  ┌──────────────────────────────────────────┐   │            │
│  │  │  Web Worker (script runtime)              │   │            │
│  │  │  SDK: db • emit • move • chan • ui • sys  │   │            │
│  │  └──────────────────────────────────────────┘   │            │
│  └──────────────────────────────────────────────────┘            │
│                                                                   │
│  ┌──────────────────────────────────────────────────┐            │
│  │  Database Layer (dbojs)                          │            │
│  │  objects • channels • mail • bboard • counters  │            │
│  └──────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Deno (TypeScript, ESM) |
| Primary transport | WebSocket |
| Secondary transport | Telnet (sidecar) |
| Web framework | Hono / Oak |
| Database | dbojs (embedded, file-backed) |
| Scripting | Web Workers (sandboxed ESM) |
| Testing | `deno test` — 296 tests, 0 failures |
| Docs | Lume (static site generator) |
| CI | GitHub Actions |

## Comparison with Other MU* Servers

| Feature | PennMUSH | TinyMUSH | MUX2 | **UrsaMU** |
|---------|---------|---------|------|----------|
| Language | C | C | C | **TypeScript** |
| Protocol | Telnet | Telnet | Telnet | **WebSocket** |
| Scripting | MUSHcode | MUSHcode | MUSHcode | **Sandboxed ESM** |
| Plugin system | No | No | No | **Yes** |
| Web client | No | No | No | **Native** |
| Discord | No | No | No | **Built-in** |
| Package manager | No | No | No | **Deno/JSR** |
| Docker support | Manual | Manual | Manual | **Yes** |
| License | Penn (custom) | TinyMUSH | Artistic | **MIT** |

## Project Status

UrsaMU is at **v1.0**. Current version is `1.0.0`.

- **Test suite**: 296 passing, 0 failing
- **Core systems**: complete (commands, sandbox, WebSocket, Discord, scenes, channels)
- **Status**: v1.0.0 released

The project is open-source under the MIT License. Contributions are welcome!
