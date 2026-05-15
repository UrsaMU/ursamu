---
layout: layout.vto
title: Guides
description: User guides and tutorials for UrsaMU
---

# UrsaMU Guides

User guides and tutorials for UrsaMU v2.6.0 — installation, day-to-day play,
admin operations, plugin development, and softcoding.

## Getting Started

- [**Installation**](./installation.md) — Prerequisites, install methods,
  first-run setup, and connecting.
- [**User Guide**](./user-guide.md) — Connecting and playing as a player.
- [**CLI Reference**](./cli.md) — `ursamu create`, `plugin`, `update`, `scripts`.

## Operating a Server

- [**Admin Guide**](./admin-guide.md) — Permissions, user management,
  configuration, `@reload`, plugin install behavior, security.
- [**Production Deployment**](./deployment.md) — `.env` and `JWT_SECRET`,
  `scripts/daemon.sh`, systemd, nginx + TLS, log rotation, updates.
- [**Docker**](./docker.md) — Containerized deployment with `docker compose`.
- [**Password Reset**](./password-reset.md) — Admin tokens, player flow,
  REST API.
- [**Debugging**](./debugging.md) — Common runtime errors and how to fix them.

## Customizing the Game

- [**Customization**](./customization.md) — Color codes, custom commands,
  attributes, plugins, REST routes, format handlers, external integrations.
- [**Lock Expressions**](./lock-expressions.md) — Lockfunc syntax, boolean
  operators, custom lockfuncs via `registerLockFunc`.
- [**Command Reference**](./commands.md) — All built-in commands.
- [**Help Authoring**](./help-authoring.md) — Writing help files, directory
  structure, conventions.

## Writing Code

- [**Scripting**](./scripting.md) — Sandbox model, the `u` SDK, ESM vs legacy
  blocks, aliases and switches.
- [**Build Your First Script**](./first-script.md) — Step-by-step walkthrough.
- [**SDK Cookbook**](./sdk-cookbook.md) — Every `u.*` namespace with examples.
- [**Soft-Coding**](./softcoding.md) — Storing scripts in attributes, parent
  inheritance, `@trigger` / `u.trigger` / `u.eval`.
- [**Recipes**](./recipes.md) — Copy-paste patterns for common tasks.
- [**Game Clock**](./gameclock.md) — `u.sys.gameTime` and the in-game calendar.

## Game Systems

- [**Scenes**](./scenes.md) — Collaborative RP logs: create, pose, export.
- [**Wiki**](./wiki.md) — File-based Markdown wiki with frontmatter and REST.

## MUSH Compatibility

Coming from PennMUSH, TinyMUSH, or MUX2? See
[mush compatibility](../mush_compatibility.md) for what works today, what
differs, and how to connect with traditional MU* clients.
