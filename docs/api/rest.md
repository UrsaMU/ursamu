---
layout: layout.vto
title: REST API Reference
description: Complete reference for all UrsaMU HTTP endpoints — auth, players, channels, objects, scenes, mail, building, wiki, help, and health.
---

# REST API Reference

The UrsaMU REST API runs on the same port as the WebSocket hub (default `4203`).

---

## Authentication

All endpoints require a `Bearer` JWT in the `Authorization` header unless marked **None**.

Obtain a token via `POST /api/v1/auth/login`. Tokens are signed with `JWT_SECRET` — set this in production.

```bash
Authorization: Bearer <token>
```

### Error responses

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing or invalid body fields |
| `401` | Missing or invalid token |
| `403` | Valid token, insufficient permissions (flag check failed) |
| `404` | Resource not found |
| `429` | Rate limited |
| `500` | Internal server error |

All error bodies follow the same shape:

```json
{ "error": "Human-readable message" }
```

---

## WebSocket Connection

The WebSocket hub is on the same port as HTTP (`4203`). Two connection modes are supported:

### JWT pre-auth (web clients)

Attach a token as a query parameter. The player is authenticated immediately — no
`connect name password` prompt needed.

```
ws://localhost:4203?token=<jwt>&client=web
```

### Classic connect (Telnet-style)

Connect without a token. The server sends the connect screen. Authenticate with:

```
connect <name> <password>
```

### Rate limiting

Each WebSocket connection is limited to **10 commands per second**. Excess commands
are silently dropped (a warning is logged server-side). This cannot be changed per
connection — if you need higher throughput, batch commands or use the REST API.

---

## Auth Endpoints

### POST /api/v1/auth/register

Create a new character account. Returns a JWT.

```bash
curl -X POST http://localhost:4203/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "password": "hunter2"}'
```

```json
{ "token": "<jwt>" }
```

### POST /api/v1/auth/login

Authenticate and receive a JWT.

```bash
curl -X POST http://localhost:4203/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "password": "hunter2"}'
```

```json
{ "token": "<jwt>" }
```

### POST /api/v1/auth/reset-password

Consume a one-time reset token and set a new password.

```bash
curl -X POST http://localhost:4203/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "<one-time-token>", "password": "newpassword"}'
```

```json
{ "message": "Password reset successfully." }
```

---

## Players & Channels

### GET /api/v1/me

Current player profile (requires auth).

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4203/api/v1/me
```

```json
{
  "id": "p-1",
  "name": "Alice",
  "flags": ["connected", "player"],
  "data": { "description": "A mysterious figure.", "avatar": "/avatars/alice.png" }
}
```

### GET /api/v1/players/online

List connected players. No auth required.

```bash
curl http://localhost:4203/api/v1/players/online
```

```json
[
  { "id": "p-1", "name": "Alice", "location": "The Lobby" },
  { "id": "p-2", "name": "Bob",   "location": "The Library" }
]
```

### GET /api/v1/channels

List all channels.

```bash
curl http://localhost:4203/api/v1/channels
```

```json
[
  { "name": "Public", "header": "[Public]", "members": 4 },
  { "name": "Staff",  "header": "[Staff]",  "members": 2 }
]
```

### GET /api/v1/channels/:name/history

Recent message history for a channel (requires auth).

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4203/api/v1/channels/Public/history?limit=20"
```

```json
[
  { "sender": "Alice", "message": "Hello everyone!", "timestamp": 1750536000000 },
  { "sender": "Bob",   "message": "Hey Alice.",       "timestamp": 1750536010000 }
]
```

---

## Database Objects

### GET /api/v1/dbos

List accessible objects. Optional `?flags=` filter.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4203/api/v1/dbos?flags=room"
```

### GET /api/v1/dbobj/:id

Fetch a single game object by its DB id.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4203/api/v1/dbobj/p-1
```

```json
{
  "id": "p-1",
  "name": "Alice",
  "location": "room-1",
  "flags": ["connected", "player"],
  "data": { "description": "…", "state": {} },
  "contents": []
}
```

### PATCH /api/v1/dbobj/:id

Update object data, name, or description (requires ownership or admin).

```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": {"description": "A tall figure in a green cloak."}}' \
  http://localhost:4203/api/v1/dbobj/p-1
```

---

## Scenes

### GET /api/v1/scenes

List active scenes (requires auth).

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4203/api/v1/scenes
```

```json
[
  {
    "id": "sc-1",
    "name": "The Heist",
    "status": "active",
    "type": "action",
    "roomId": "room-5",
    "participants": ["Alice", "Bob"],
    "createdAt": 1750536000000
  }
]
```

### POST /api/v1/scenes

Create a new scene (requires auth).

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "The Heist", "type": "action", "roomId": "room-5"}' \
  http://localhost:4203/api/v1/scenes
```

### GET /api/v1/scenes/:id

Get scene details with pose log and participants.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4203/api/v1/scenes/sc-1
```

### PATCH /api/v1/scenes/:id

Update scene metadata (owner or admin).

```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "closed"}' \
  http://localhost:4203/api/v1/scenes/sc-1
```

### GET /api/v1/scenes/:id/export

Export a scene as Markdown or JSON.

```bash
# Markdown (for copy-paste into a wiki or Google Doc)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4203/api/v1/scenes/sc-1/export?format=markdown"

# JSON (for external tools)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4203/api/v1/scenes/sc-1/export?format=json"
```

### POST /api/v1/scenes/:id/pose

Add a pose, OOC comment, or scene-set to a scene.

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"msg": "Alice steps through the door.", "type": "pose"}' \
  http://localhost:4203/api/v1/scenes/sc-1/pose
```

`type` values: `"pose"` (default), `"ooc"`, `"set"` (scene description).

### POST /api/v1/scenes/:id/join

Join a scene (requires auth).

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4203/api/v1/scenes/sc-1/join
```

### POST /api/v1/scenes/:id/invite

Invite a player to a scene (owner only).

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"playerId": "p-3"}' \
  http://localhost:4203/api/v1/scenes/sc-1/invite
```

---

## Mail

Provided by the [mail-plugin](https://github.com/UrsaMU/mail-plugin).

### GET /api/v1/mail

Inbox (requires auth).

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4203/api/v1/mail
```

```json
[
  {
    "id": "ml-1",
    "from": "Bob",
    "subject": "Meeting tonight",
    "read": false,
    "receivedAt": 1750536000000
  }
]
```

### POST /api/v1/mail

Send a new message.

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "Bob", "subject": "Re: Meeting", "body": "I will be there!"}' \
  http://localhost:4203/api/v1/mail
```

### GET /api/v1/mail/:id

Read a message (marks as read).

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4203/api/v1/mail/ml-1
```

### DELETE /api/v1/mail/:id

Delete a message.

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4203/api/v1/mail/ml-1
```

---

## Help

Provided by the [help-plugin](https://github.com/UrsaMU/help-plugin).

### GET /api/v1/help

List all help sections and topics. No auth required.

```bash
curl http://localhost:4203/api/v1/help
```

```json
{
  "sections": {
    "building": ["dig", "open", "link", "describe", "examine"],
    "mail":     ["send", "reply", "delete", "folders"],
    "social":   ["say", "pose", "page"]
  }
}
```

### GET /api/v1/help/:topic

Fetch a single topic. Use `?format=md` for raw Markdown.

```bash
# Rendered (MUSH color codes stripped)
curl http://localhost:4203/api/v1/help/dig

# Raw Markdown
curl "http://localhost:4203/api/v1/help/dig?format=md"
```

### POST /api/v1/help/:topic

Create or update a help entry (admin).

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "# DIG\n\nCreates a new room.", "section": "building"}' \
  http://localhost:4203/api/v1/help/dig
```

### DELETE /api/v1/help/:topic

Delete a help entry (admin). Restores the underlying file entry if one exists.

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4203/api/v1/help/dig
```

---

## Building

Provided by the [builder-plugin](https://github.com/UrsaMU/builder-plugin). Requires `builder+` flag.

### POST /api/v1/building/room

Create a new room.

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "The Library", "description": "Shelves of ancient tomes."}' \
  http://localhost:4203/api/v1/building/room
```

---

## Wiki

Provided by the [wiki-plugin](https://github.com/UrsaMU/wiki-plugin).

### GET /api/v1/wiki

List all wiki topics. No auth required.

```bash
curl http://localhost:4203/api/v1/wiki
```

### GET /api/v1/wiki/:topic

Retrieve a wiki page. No auth required.

```bash
curl http://localhost:4203/api/v1/wiki/lore/history
```

---

## Config & Text

### GET /api/v1/config

Server config (name, version, ports, theme). No auth required.

```bash
curl http://localhost:4203/api/v1/config
```

```json
{
  "game": { "name": "My Game", "version": "0.0.1" },
  "server": { "http": 4203, "telnet": 4201 }
}
```

### GET /api/v1/connect

Connect-screen text (raw, suitable for display in a login screen).

```bash
curl http://localhost:4203/api/v1/connect
```

### GET /api/v1/welcome

Welcome text shown after login.

```bash
curl http://localhost:4203/api/v1/welcome
```

---

## Health

### GET /health

No auth required. Returns immediately; useful for load balancer health checks.

```bash
curl http://localhost:4203/health
```

```json
{ "status": "ok", "engine": "UrsaMU" }
```

---

## Plugin Endpoints

Official plugins add versioned routes on install:

| Plugin | Base path | Full docs |
|--------|-----------|-----------|
| **jobs** | `/api/v1/jobs` | [UrsaMU/jobs-plugin](https://github.com/UrsaMU/jobs-plugin) |
| **events** | `/api/v1/events` | [Events plugin](./events.md) |
| **bbs** | `/api/v1/bbs` | [UrsaMU/bbs-plugin](https://github.com/UrsaMU/bbs-plugin) |

Custom plugins register routes via `registerPluginRoute(path, handler)` — see [Plugin Development](../plugins/index.md).
