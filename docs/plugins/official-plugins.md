---
layout: layout.vto
title: Official Plugins
description: The official UrsaMU plugin ecosystem — every published @ursamu/* package, what it provides, and how to add it to a game.
---

# Official Plugins

UrsaMU ships as a set of **JSR packages** under the
[`@ursamu` scope](https://jsr.io/@ursamu). The engine and its plugins
are published from the
[UrsaMU monorepo](https://github.com/UrsaMU/ursamu) and installed by
adding them to a game project's `deno.json`.

Games created with the CLI already declare the default set (help,
channels, builder, bbs, mail, wiki, staff web, and the public site).
Add or pin more by editing `deno.json` `imports` and the plugin list
your game loads.

---

## Installing a package

Add the package to your game's imports (pinning a version is
recommended):

```json
// deno.json
{
  "imports": {
    "@ursamu/mush": "jsr:@ursamu/mush@1.0.40",
    "@ursamu/wod20th": "jsr:@ursamu/wod20th@1.1.0"
  }
}
```

Then register the plugin in your game's startup (`src/main.ts`).
Plugin packages export their registration from their entry point;
consult each package's docs for the exact call.

---

## Engine & platform

These are the core packages every game builds on.

| Package | Version | Description |
|---------|---------|-------------|
| [`@ursamu/core`](https://jsr.io/@ursamu/core) | 1.0.6 | Transports, database, and the plugin loader. |
| [`@ursamu/mush`](https://jsr.io/@ursamu/mush) | 1.0.40 | The engine — world objects, commands, TinyMUX-style softcode. |
| [`@ursamu/cli`](https://jsr.io/@ursamu/cli) | 0.1.6 | `create` / `plugin` / `update` — scaffold and manage a game. |
| [`@ursamu/mushcode`](https://jsr.io/@ursamu/mushcode) | 0.7.0 | Softcode parser, evaluator, linter, and printer. |
| [`@ursamu/site`](https://jsr.io/@ursamu/site) | 0.1.96 | Public front-end shell — layout framing, design tokens, swappable skins, `/play`. |
| [`@ursamu/web`](https://jsr.io/@ursamu/web) | 0.2.82 | Staff web console at `/admin/` — wiki, database, and more. |

## Services

Features that add capabilities to any game.

| Package | Version | Description |
|---------|---------|-------------|
| [`@ursamu/help`](https://jsr.io/@ursamu/help) | 1.3.1 | API-first `+help` — file, DB, and command providers; per-plugin help dirs. |
| [`@ursamu/channels`](https://jsr.io/@ursamu/channels) | 1.2.4 | Channel system — alias dispatch, auto-join, web hub. |
| [`@ursamu/builder`](https://jsr.io/@ursamu/builder) | 1.3.10 | World-building — `@dig`, `@open`, `@link`, `@describe`, `@examine`. |
| [`@ursamu/bbs`](https://jsr.io/@ursamu/bbs) | 1.2.1 | Bulletin boards — threading, categories, sticky posts, Discord webhooks. |
| [`@ursamu/mail`](https://jsr.io/@ursamu/mail) | 2.9.5 | In-game mail — drafts, folders, attachments, quota, expiry. |
| [`@ursamu/jobs`](https://jsr.io/@ursamu/jobs) | 1.2.0 | Jobs and request system — player requests, staff commands. |
| [`@ursamu/discord`](https://jsr.io/@ursamu/discord) | 1.0.5 | Webhook-based Discord integration — channel bridging, presence. |
| [`@ursamu/wiki`](https://jsr.io/@ursamu/wiki) | 0.2.9 | File-based markdown wiki — pages, search, history, backlinks. |
| [`@ursamu/combat`](https://jsr.io/@ursamu/combat) | 0.8.1 | System-agnostic combat engine — turn helpers, adapter kit, walker, JSON AI. |
| [`@ursamu/lang-plugin`](https://jsr.io/@ursamu/lang-plugin) | 3.1.1 | Per-listener language garbling with configurable phoneme-based fake speech. |
| [`@ursamu/map-plugin`](https://jsr.io/@ursamu/map-plugin) | 3.2.1 | Procedural sector maps — vehicles, fog, overlays, realms, builder tools. |

## Game systems

TTRPG systems and genre plugins.

| Package | Version | Description |
|---------|---------|-------------|
| [`@ursamu/wod20th`](https://jsr.io/@ursamu/wod20th) | 1.1.0 | World of Darkness 20th — VtM, WtA, Mortal, Kinfolk templates. |
| [`@ursamu/cinematic-plugin`](https://jsr.io/@ursamu/cinematic-plugin) | 1.0.0 | Cinematic Unisystem — chargen, D10 rolls, Drama Points, gear. |
| [`@ursamu/cofd-plugin`](https://jsr.io/@ursamu/cofd-plugin) | 1.4.1 | Chronicles of Darkness 2e — sheets, chargen, d10 dice, CtL overlay. |
| [`@ursamu/sprawl-plugin`](https://jsr.io/@ursamu/sprawl-plugin) | 1.0.4 | Sprawl Goons 2d6 — chargen, combat, net, chrome, city. |

> **Monorepo-only (not on JSR yet):** `ai-gm`, `events`, `cyberpunk`,
> `dnd`, `scene`, `vendor`, `sw5e`. Use from a checkout.
>
> **Source under `unfinished/packages/`:** `cofd`, `sprawl`, `mekton`,
> `utopia`, `cities`, `theme-studio`. Older JSR builds of
> `cofd-plugin` / `sprawl-plugin` remain installable; active
> development is unfinished.

---

## Adding your own plugin

Publish a plugin as an `@ursamu/*` package from the monorepo, or
distribute it as its own JSR scope and document its registration
call. See [Building a Plugin](./first-plugin.md) and the
[plugin authoring guide](./basics.md) for the full contract.

For the git-based community plugin manager
(`ursamu plugin install`), see
[Installing Community Plugins](./index.md#installing-community-plugins).
