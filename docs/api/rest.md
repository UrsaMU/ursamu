---
layout: layout.vto
title: REST API Reference
description: Complete reference for UrsaMU's built-in HTTP endpoints — auth, players, channels, DB objects, scenes, config, and UI manifest.
---

# REST API Reference

The UrsaMU HTTP API runs on the same port as the WebSocket hub (default
`4203`). This document covers only the **engine-built-in** endpoints —
plugins (mail, jobs, bbs, help, wiki, builder, events) register their own
routes via `registerPluginRoute()` and document them in their own repos.

Verified against `src/routes/` and `src/app.ts` for v2.6.0.

## Contents

- [Auth model](#auth-model)
- [Error responses](#error-responses)
- [WebSocket connection](#websocket-connection)
- [Auth router](#auth-router) — `/api/v1/auth/*`
- [Players & channels](#players--channels) — `/api/v1/me`, `/api/v1/players/*`, `/api/v1/channels/*`
- [DB Objects](#db-objects) — `/api/v1/dbos`, `/api/v1/dbobj/:id`
- [Scenes](#scenes) — `/api/v1/scenes/*`
- [Config & text](#config--text) — `/api/v1/config`, `/api/v1/connect`, `/api/v1/welcome`
- [UI manifest](#ui-manifest) — `/api/v1/ui-manifest`
- [Avatars](#avatars) — `/avatars/:id`
- [Health](#health) — `/health`
- [Plugin endpoints](#plugin-endpoints)

---

## Auth model

All protected endpoints require a JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain a token via `POST /api/v1/auth` or `POST /api/v1/auth/register`.
Tokens are signed with `JWT_SECRET` (set in `.env`). If `JWT_SECRET` is
unset in production the engine exits at boot. In dev a random per-process
secret is used and tokens are invalidated on every restart.

A global API rate limit applies per IP (`apiRateLimits` map in
`src/app.ts`). Auth endpoints have an additional per-IP brute-force
guard.

## Error responses

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing or invalid body |
| 401 | Missing or invalid token |
| 403 | Valid token, insufficient permissions |
| 404 | Resource not found |
| 405 | Method not allowed |
| 429 | Rate limited (`Retry-After` header set) |
| 500 | Internal server error |

Error body shape:

```json
{ "error": "Human-readable message" }
```

---

## WebSocket connection

The hub shares the HTTP port. Two connection modes:

### JWT pre-auth (web clients)

```
ws://localhost:4203?token=<jwt>&client=web
```

The player is authenticated immediately. On JWT reauth the engine
re-applies the `connected` flag and re-joins the player's `#cid` and
`#location` rooms (v2.4.0 fix).

### Classic connect (Telnet-style)

Connect without a token, then send `connect <name> <password>`.

### Rate limiting

Each WebSocket is limited to **10 commands/sec**. Excess commands are
silently dropped (warning logged server-side).

---

## Auth router

Defined in `src/routes/authRouter.ts`. All endpoints accept `POST` only.
Path is matched by suffix on `/api/v1/auth*`.

### POST /api/v1/auth

Login. Returns a JWT.

Body:

```json
{ "username": "Alice", "password": "hunter2" }
```

Response 200:

```json
{ "token": "<jwt>", "id": "5", "name": "Alice" }
```

Errors: 401 invalid credentials, 429 rate-limited.

### POST /api/v1/auth/register

Create a new character. Returns a JWT.

Body:

```json
{ "username": "Alice", "email": "alice@example.com", "password": "hunter2" }
```

Response 201:

```json
{ "token": "<jwt>", "id": "5", "name": "Alice" }
```

### POST /api/v1/auth/reset-password

Consume a one-time reset token and set a new password. Token comparison
is constant-time (v2.0.0 hardening). Expired tokens are cleaned up
opportunistically.

Body:

```json
{ "token": "<one-time-token>", "newPassword": "newpw" }
```

Response 200:

```json
{ "message": "Password updated successfully." }
```

---

## Players & channels

Routed from `src/app.ts`; handlers in `src/routes/playersRouter.ts`.

### GET /api/v1/me

Current player profile. Requires auth.

```json
{
  "id": "5",
  "name": "Alice",
  "flags": ["connected", "player"],
  "data": { "description": "...", "avatar": "/avatars/5" }
}
```

### GET /api/v1/players/online

List currently connected players. Requires auth.

```json
[
  { "id": "5", "name": "Alice", "location": "The Lobby" },
  { "id": "8", "name": "Bob",   "location": "The Library" }
]
```

### GET /api/v1/channels

List all channels. No auth required.

```json
[
  { "name": "Public", "header": "[Public]", "members": 4 }
]
```

### GET /api/v1/channels/:name/history

Recent messages. Requires auth. Query param `?limit=N` (default 20, max
500).

```json
[
  { "sender": "Alice", "message": "Hi!", "timestamp": 1750536000000 }
]
```

---

## DB Objects

`src/routes/dbObjRouter.ts`. All endpoints require auth.

### GET /api/v1/dbos

List accessible objects. Optional `?flags=room` filter.

### GET /api/v1/dbobj/:id

Fetch a single object.

```json
{
  "id": "5",
  "name": "Alice",
  "location": "1",
  "flags": ["connected", "player"],
  "data": { "description": "..." },
  "contents": []
}
```

### PATCH /api/v1/dbobj/:id

Update object data, name, or description. Requires ownership or admin.

Body:

```json
{ "data": { "description": "A tall figure in a green cloak." } }
```

> The engine does not currently expose `PUT` / `DELETE` for `/dbobj/:id`
> or any `/attrs` sub-routes. Edit attributes via the `&attr` command or
> a custom plugin route.

---

## Scenes

`src/routes/sceneRouter.ts`. All endpoints require auth.

### GET /api/v1/scenes

List active scenes the caller can see.

### POST /api/v1/scenes

Create a scene.

Body:

```json
{ "name": "The Heist", "type": "action", "roomId": "room-5" }
```

### GET /api/v1/scenes/locations

List rooms that currently host scenes.

### GET /api/v1/scenes/:id

Fetch a scene with its pose log and participants.

### PATCH /api/v1/scenes/:id

Update scene metadata (owner or admin; ownerless scenes are adopted by
the patcher — v2.0.0 fix).

### POST /api/v1/scenes/:id/pose

Add a pose, OOC line, or scene-set.

Body:

```json
{ "msg": "Alice steps through the door.", "type": "pose" }
```

`type`: `"pose"` (default), `"ooc"`, `"set"`. When type is not `"set"`,
`msg` is required (400 otherwise).

### PATCH /api/v1/scenes/:id/pose/:poseId

Edit an existing pose. Owner or admin.

### POST /api/v1/scenes/:id/join

Join a scene.

### POST /api/v1/scenes/:id/invite

Invite a player. Owner only.

Body:

```json
{ "playerId": "8" }
```

### GET /api/v1/scenes/:id/export

Export as Markdown or JSON. Query: `?format=markdown` (default) or
`?format=json`.

---

## Config & text

`src/routes/config.ts`. No auth required.

### GET /api/v1/config

Server config (name, version, ports, theme).

```json
{
  "game":   { "name": "My Game", "version": "0.0.1" },
  "server": { "http": 4203, "telnet": 4201 },
  "theme":  { "primary": "#...", "backgroundImage": "..." }
}
```

### GET /api/v1/connect

Connect-screen text (Markdown). Reads
`config.game.text.connect` (default `text/default_connect.txt`) with a
path-traversal guard.

### GET /api/v1/welcome

Post-login welcome text (from the `texts` DBO, id `welcome`).

### GET /api/v1/404

Site 404 page content (from `texts` DBO, id `404`). Falls back to a
default if no entry exists.

---

## UI manifest

### GET /api/v1/ui-manifest

Returns the list of UI components registered by plugins via
`registerUIComponent()`. Optionally authenticated — if a JWT is
presented, results are filtered by the caller's privileges
(`requires.flag`, etc.).

```json
[
  { "element": "myplugin-panel", "title": "My Panel", "url": "..." }
]
```

External script URLs are rejected at registration time (v1.9.3
hardening).

---

## Avatars

### GET /avatars/:id

Public avatar image. `:id` must match `^[a-zA-Z0-9_-]+$` — dots and
slashes are rejected. Looks for `data/avatars/<id>.{png,jpg,gif,webp}`.
Cached for 1 hour.

---

## Health

### GET /health (or GET /)

Liveness probe. No auth.

```json
{ "status": "ok", "engine": "UrsaMU" }
```

---

## Plugin endpoints

Plugins register routes via `registerPluginRoute(prefix, handler)`. The
engine matches by `startsWith(prefix)` and forwards the request along
with the authenticated `userId` (or `null`).

Official plugins:

| Plugin | Base path | Repo |
|--------|-----------|------|
| jobs   | `/api/v1/jobs`   | [UrsaMU/jobs-plugin](https://github.com/UrsaMU/jobs-plugin) |
| events | `/api/v1/events` | [UrsaMU/events-plugin](https://github.com/UrsaMU/events-plugin) |
| bbs    | `/api/v1/bbs`    | [UrsaMU/bbs-plugin](https://github.com/UrsaMU/bbs-plugin) |
| mail   | `/api/v1/mail`   | [UrsaMU/mail-plugin](https://github.com/UrsaMU/mail-plugin) |
| help   | `/api/v1/help`   | [UrsaMU/help-plugin](https://github.com/UrsaMU/help-plugin) |
| wiki   | `/api/v1/wiki`   | [UrsaMU/wiki-plugin](https://github.com/UrsaMU/wiki-plugin) |
| builder| `/api/v1/building` | [UrsaMU/builder-plugin](https://github.com/UrsaMU/builder-plugin) |

Custom plugins register their own routes — see
[Plugin Development](../plugins/index.md).
