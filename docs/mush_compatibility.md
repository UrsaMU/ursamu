---
layout: layout.vto
title: MUSH Compatibility
description: What UrsaMU supports compared to traditional MUSH servers like PennMUSH and TinyMUX, and what's planned.
---

# MUSH Compatibility

UrsaMU is **not a drop-in replacement** for PennMUSH, TinyMUSH, or MUX2. It is a fresh platform with a different architecture — WebSocket-native, TypeScript, sandboxed scripts instead of MUSHcode.

If you are migrating from a traditional MUSH or hosting your first server, this page tells you exactly what works today and what is planned.
---

## What Works Today

| Feature | Status | Notes |
|---------|--------|-------|
| `connect <name> <password>` | ✅ Working | Standard login command |
| `create <name> <password>` | ✅ Working | Character creation |
| `look` / `l` | ✅ Working | Room and object descriptions |
| Auto-`look` on connect | ✅ Working | Fires automatically after login |
| `say` / `"` | ✅ Working | Room speech |
| `pose` / `:` | ✅ Working | Emotes |
| `page <player>=<msg>` | ✅ Working | Private messages |
| `who` | ✅ Working | Online player list |
| `score` | ✅ Working | Character stats |
| `inventory` / `inv` | ✅ Working | Carried objects |
| `get` / `drop` / `give` | ✅ Working | Object interaction |
| `home` | ✅ Working | Return to home location |
| `teleport` | ✅ Working | Admin/wizard teleport |
| `examine` | ✅ Working | Full object inspection |
| `@desc` / `@name` | ✅ Working | Object descriptions and naming |
| `@dig` | ✅ Working | Create rooms |
| `@open` / `@link` / `@unlink` | ✅ Working | Exit management |
| `@create` | ✅ Working | Create objects |
| `@destroy` / `@clone` | ✅ Working | Object lifecycle |
| `@lock` / `@set` | ✅ Working | Flags and locks |
| `@parent` | ✅ Working | Object inheritance |
| `@boot` / `@toad` | ✅ Working | Admin user management |
| `@newpassword` | ✅ Working | Password reset |
| `@chown` | ✅ Working | Ownership transfer |
| `@channel/list/join/leave` | ✅ Working | Channel system |
| `@chancreate` / `@chandestroy` / `@chanset` | ✅ Working | Channel admin |
| `@reboot` / `@shutdown` | ✅ Working | Server control (admin+) |
| `@moniker` | ✅ Working | Color-coded display names (admin+) |
| Connection banner | ✅ Working | `text/default_connect.txt` shown pre-auth |
| Broadcast on connect/disconnect | ✅ Working | Room sees join/leave messages |
| Exit movement (type exit name) | ✅ Working | Standard directional movement |
| Help system | ✅ Working | `help [<topic>]` |
| Discord bridge | ✅ Working | Relay in-game chat to Discord |
| Scene tracking & export | ✅ Working | REST API, Markdown or JSON output |
| `@emit` / `@pemit` / `@remit` | ✅ Working | Staff broadcast commands |
| MOTD (`@motd`, `@motd/set`) | ✅ Working | Displayed automatically on login |
| Login notifications | ✅ Working | Unread mail + new bboard posts on connect |
| Connection history | ✅ Working | Last login time and failed attempt count |
| Bulletin board (`@bblist`, `@bbread`, `@bbpost`) | ✅ Working | Full bboard system with unread tracking |
| `@quota` | ✅ Working | View and set object quota |
| `@find` | ✅ Working | Search objects by name, flag, or type |
| `@stats` | ✅ Working | Server uptime and object counts |
| `@trigger <obj>/<attr>` | ✅ Working | Fire stored attributes as scripts |
| `@wipe <obj>` | ✅ Working | Clear all user-set attributes |
| `@Aconnect` / `@Adisconnect` | ✅ Working | `&ACONNECT` / `&ADISCONNECT` attributes fire on login/logout |
---

## What's Different from Traditional MUSH

| Traditional MUSH | UrsaMU |
|-----------------|--------|
| MUSHcode (softcode) scripting | TypeScript/JS in sandboxed Web Workers |
| Telnet primary | WebSocket primary (Telnet sidecar available) |
| Attributes on objects run softcode | Scripts registered as commands or object triggers |
| `@tr` / `@trigger` | `@trigger <obj>/<attr>` command + `u.trigger()` SDK method |
| `@pemit` / `@remit` | `@pemit` and `@remit` — both implemented |
| `@switch` / `@if` / MUSHcode functions | Full JavaScript/TypeScript in scripts |

MUSHcode attributes (`@va`–`@vz`, inline softcode, `&ATTRIBUTE`) are **not supported**. UrsaMU scripting uses the [Sandbox SDK](../guides/scripting/) instead.
---

## Planned Enhancements

| Feature | Notes |
|---------|-------|
| Terminal/screen settings | Width detection via Telnet NAWS, persistent pager settings |
| MUSHcode inline softcode | Not planned — use TypeScript scripts instead |
---

## Connecting with a Traditional MU* Client

UrsaMU's Telnet sidecar makes it compatible with any standard MU* client:

| Client | Platform | Connection |
|--------|---------|-----------|
| [Mudlet](https://www.mudlet.org/) | Windows / Mac / Linux | Host + port (default `4201`) |
| [MUSHclient](https://mushclient.com/) | Windows | Host + port (default `4201`) |
| [Potato](https://www.potatomushclient.com/) | Windows / Mac / Linux | Host + port (default `4201`) |
| SimpleMU | Windows | Host + port (default `4201`) |
| Any terminal | Any | `telnet <host> 4201` |

WebSocket-capable clients can connect directly to port `4202` (or `4203` for HTTP/WS).
