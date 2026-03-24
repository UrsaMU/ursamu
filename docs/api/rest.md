---
layout: layout.vto
title: REST API Reference
description: Complete reference for all UrsaMU HTTP endpoints — auth, players, channels, objects, scenes, mail, building, wiki, and health.
---

# REST API Reference

The UrsaMU REST API runs on the same port as the WebSocket hub (default `4203`).

## Authentication

All endpoints require a `Bearer` JWT in the `Authorization` header unless marked **None**.

Obtain a token via `POST /api/v1/auth/login`. Tokens are signed with `JWT_SECRET` from your environment — set this in production.

```
Authorization: Bearer <token>
```
---

## Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/auth/register` | None | Create a new character account |
| `POST` | `/api/v1/auth/login` | None | Authenticate and receive a JWT |
| `POST` | `/api/v1/auth/reset-password` | None | Consume a one-time token and set a new password |
---

## Players & Channels

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/me` | Required | Current user profile |
| `GET` | `/api/v1/players/online` | None | List connected players |
| `GET` | `/api/v1/channels` | None | List all channels |
---

## Database Objects

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/dbos` | Required | List accessible objects (optional `?flags=` filter) |
| `GET` | `/api/v1/dbobj/:id` | Required | Fetch a single object |
| `PATCH` | `/api/v1/dbobj/:id` | Required | Update object data, name, or description |
---

## Scenes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/scenes` | Required | List active scenes |
| `POST` | `/api/v1/scenes` | Required | Create a new scene |
| `GET` | `/api/v1/scenes/locations` | Required | List accessible rooms |
| `GET` | `/api/v1/scenes/:id` | Required | Get scene details with participants |
| `PATCH` | `/api/v1/scenes/:id` | Required | Update scene metadata (name, status, type, etc.) |
| `GET` | `/api/v1/scenes/:id/export` | Required | Export as `?format=markdown` or `?format=json` |
| `POST` | `/api/v1/scenes/:id/pose` | Required | Add a pose, ooc, or set entry |
| `PATCH` | `/api/v1/scenes/:id/pose/:poseId` | Required | Edit an existing pose |
| `POST` | `/api/v1/scenes/:id/join` | Required | Join a scene |
| `POST` | `/api/v1/scenes/:id/invite` | Required | Invite a player (owner only) |
---

## Mail

Provided by the [mail-plugin](https://github.com/UrsaMU/mail-plugin).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/mail` | Required | Inbox |
| `GET` | `/api/v1/mail/sent` | Required | Sent messages |
| `POST` | `/api/v1/mail` | Required | Send a new message |
| `GET` | `/api/v1/mail/:id` | Required | Read a message (marks as read) |
| `DELETE` | `/api/v1/mail/:id` | Required | Delete a message |
---

## Building

Provided by the [builder-plugin](https://github.com/UrsaMU/builder-plugin). Requires `builder+` flag.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/building/room` | Required | Create a room |
---

## Wiki

Provided by the [wiki-plugin](https://github.com/UrsaMU/wiki-plugin).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/wiki` | None | List all wiki topics |
| `GET` | `/api/v1/wiki/:topic` | None | Retrieve a wiki topic |
---

## Config & Text

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/config` | None | Server config (name, version, ports, theme) |
| `GET` | `/api/v1/connect` | None | Connect-screen text |
| `GET` | `/api/v1/welcome` | None | Welcome text |
---

## Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | None | Returns `{"status":"ok","engine":"UrsaMU"}` |
---

## Plugin Endpoints

Official plugins add versioned routes on install:

| Plugin | Base path | Docs |
|--------|-----------|------|
| **jobs** | `/api/v1/jobs` | [UrsaMU/jobs-plugin](https://github.com/UrsaMU/jobs-plugin) |
| **events** | `/api/v1/events` | [UrsaMU/events-plugin](https://github.com/UrsaMU/events-plugin) |

Custom plugins register routes via `registerPluginRoute(path, handler)` — see [Plugin Development](../plugins/index.md).
