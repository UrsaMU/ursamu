---
layout: layout.vto
title: Scenes
description: How to create, join, write in, and export collaborative roleplay scenes in UrsaMU.
nav:
  - text: Overview
    url: "#overview"
  - text: Creating a Scene
    url: "#creating-a-scene"
  - text: Listing Scenes
    url: "#listing-scenes"
  - text: Joining a Scene
    url: "#joining-a-scene"
  - text: Writing Poses
    url: "#writing-poses"
  - text: Editing a Pose
    url: "#editing-a-pose"
  - text: Updating a Scene
    url: "#updating-a-scene"
  - text: Private Scenes
    url: "#private-scenes"
  - text: Exporting a Scene
    url: "#exporting-a-scene"
  - text: Scene Hooks
    url: "#scene-hooks"
  - text: API Reference
    url: "#api-reference"
---

# Scenes

Scenes are collaborative roleplay logs — structured writing sessions between
players. The scene system tracks who participated, what was written, and where
it happened, and lets you export the finished log as Markdown or JSON.

All scene endpoints require a `Bearer` JWT token in the `Authorization` header.

---

## Overview

```
Player A                   Player B                 Server
────────                   ────────                 ──────
POST /scenes               POST /scenes/:id/join
  name, location      ──▶  (joins after creation)
  ← 201 scene object

POST /scenes/:id/pose ──▶                    ──▶  broadcasts to room
  msg, type=pose

                           POST /scenes/:id/pose
                      ◀──  msg, type=pose      ──▶  broadcasts to room

PATCH /scenes/:id          (close the scene)
  status=closed

GET /scenes/:id/export
  ?format=markdown    ──▶  ← Markdown log file
```

---

## Creating a Scene

```
POST /api/v1/scenes
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Scene title |
| `location` | string | Yes | Room dbref (e.g. `#5`) |
| `desc` | string | No | Scene description or opening set |
| `sceneType` | string | No | `social`, `event`, `vignette`, `plot`, `training`, `other` (default: `social`) |
| `private` | boolean | No | If `true`, only invited players can see or post (default: `false`) |

**Example:**

```bash
curl -X POST https://yourgame.example.com/api/v1/scenes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "A Meeting in the Rain",
    "location": "#5",
    "desc": "Two characters cross paths on a wet street corner.",
    "sceneType": "social"
  }'
```

**Response (`201 Created`):**

```json
{
  "id": "42",
  "name": "A Meeting in the Rain",
  "location": "#5",
  "desc": "Two characters cross paths on a wet street corner.",
  "owner": "#3",
  "participants": ["#3"],
  "allowed": ["#3"],
  "private": false,
  "poses": [],
  "startTime": 1710000000000,
  "status": "active",
  "sceneType": "social"
}
```

The creator is automatically added as the first participant.

---

## Listing Scenes

```
GET /api/v1/scenes
Authorization: Bearer <token>
```

Returns all scenes visible to the authenticated user, sorted newest first.
Private scenes are filtered — only scenes where you are the owner, a participant,
or in the `allowed` list are returned.

```
GET /api/v1/scenes/locations
Authorization: Bearer <token>
```

Returns all rooms you have permission to enter, sorted alphabetically. Useful
for scene creation UIs that let the player pick a location from a list.

```json
[
  { "id": "#1", "name": "The Nexus", "type": "public" },
  { "id": "#12", "name": "Staff Lounge", "type": "private" }
]
```

`type` is `"private"` if the room has an enter lock set, `"public"` otherwise.

---

## Joining a Scene

Any player can join a public scene. Private scenes require an invitation first
(see [Private Scenes](#private-scenes)).

```
POST /api/v1/scenes/:id/join
Authorization: Bearer <token>
```

No body required. If successful, the player is added to `participants`.

```json
{ "success": true, "scene": { ... } }
```

---

## Writing Poses

```
POST /api/v1/scenes/:id/pose
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `msg` | string | Yes (except `set`) | The pose text |
| `type` | string | No | `pose` (default), `ooc`, or `set` |

**Pose types:**

| Type | Use | Broadcast format |
|------|-----|-----------------|
| `pose` | In-character action or speech | `CharName <msg>` |
| `ooc` | Out-of-character comment | `[OOC] CharName: <msg>` |
| `set` | Scene description / setter (no `msg` required) | `[Scene Set] <msg>` |

Poses are broadcast to the scene's room in real time so players in the grid
also see them. The maximum pose length is **4000 characters**.

**Example — in-character pose:**

```bash
curl -X POST https://yourgame.example.com/api/v1/scenes/42/pose \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"msg": "glances up as rain spatters her coat, then freezes.", "type": "pose"}'
```

**Example — scene setter:**

```bash
curl -X POST https://yourgame.example.com/api/v1/scenes/42/pose \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"msg": "The street is empty except for the two of them.", "type": "set"}'
```

**Response (`201 Created`):**

```json
{
  "id": "a1b2c3d4-...",
  "charId": "#3",
  "charName": "Talia",
  "moniker": "%ch%crT%cna%chl%cni%cra%cn",
  "msg": "glances up as rain spatters her coat, then freezes.",
  "type": "pose",
  "timestamp": 1710000060000
}
```

Posting automatically adds you to `participants` if you weren't already there.

---

## Editing a Pose

You can correct a pose after posting. Only the original author or the scene
owner can edit a pose.

```
PATCH /api/v1/scenes/:id/pose/:poseId
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**

```json
{ "msg": "corrected pose text" }
```

The `type` and `timestamp` cannot be changed after posting. Max 4000 characters.

**Response (`200 OK`):** the updated pose object.

---

## Updating a Scene

The scene owner (or admin/wizard) can update metadata and status.

```
PATCH /api/v1/scenes/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Updatable fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Scene title |
| `desc` | string | Scene description |
| `status` | string | `active`, `paused`, or `closed` |
| `sceneType` | string | `social`, `event`, `vignette`, `plot`, `training`, `other` |
| `endTime` | number | Unix timestamp (ms) when the scene ended |

**Example — close a scene:**

```bash
curl -X PATCH https://yourgame.example.com/api/v1/scenes/42 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "closed", "endTime": 1710003600000}'
```

---

## Private Scenes

Set `"private": true` when creating a scene to restrict access.

| Action | Who can do it |
|--------|--------------|
| View scene | Owner, participants, `allowed` list, admin/wizard |
| Post a pose | Owner, participants, `allowed` list, admin/wizard |
| Join | Only if already in `allowed` list |
| Invite | Owner, anyone in `allowed` list, admin/wizard |

### Inviting a player

```
POST /api/v1/scenes/:id/invite
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{ "target": "#7" }
```

`target` can be a dbref (`#7`) or a player name. The player is added to the
`allowed` list and can then join the scene.

---

## Exporting a Scene

```
GET /api/v1/scenes/:id/export
Authorization: Bearer <token>
```

Optional query parameter `format`:

| `format` | Content-Type | Description |
|----------|-------------|-------------|
| `markdown` *(default)* | `text/markdown` | Formatted log with header and poses |
| `json` | `application/json` | Full scene object |

**Example:**

```bash
# Markdown log
curl -H "Authorization: Bearer <token>" \
     https://yourgame.example.com/api/v1/scenes/42/export

# Raw JSON
curl -H "Authorization: Bearer <token>" \
     https://yourgame.example.com/api/v1/scenes/42/export?format=json
```

**Markdown export format:**

```markdown
# A Meeting in the Rain

**Type:** social | **Status:** closed
**Location:** The Corner of Fifth and Ash
**Started:** 2026-03-18
**Ended:** 2026-03-18
**Participants:** Talia, Marcus

---

**Talia** glances up as rain spatters her coat, then freezes.

**Marcus** turns up his collar, not yet noticing her.

*[OOC] Talia: great opener!*

---
*Exported 2026-03-18*
```

MUSH color codes are stripped from all character names and pose content in the
export, so the output is clean plain text.

---

## Scene Hooks

Every scene mutation fires a typed event on `gameHooks`, allowing plugins
(AI GM assistants, logging systems, etc.) to react without touching the
scene REST router.

Import `gameHooks` from `jsr:@ursamu/ursamu`:

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";
import type { SceneSetEvent, SceneClearEvent } from "jsr:@ursamu/ursamu";
```

### Hook reference

| Event | When it fires | Key payload fields |
|-------|--------------|-------------------|
| `scene:created` | New scene opened (`POST /scenes`) | `sceneId`, `sceneName`, `roomId`, `actorId`, `actorName`, `sceneType` |
| `scene:pose` | Any pose posted (`POST /scenes/:id/pose`) | `sceneId`, `sceneName`, `roomId`, `actorId`, `actorName`, `msg`, `type` |
| `scene:set` | Pose with `type: "set"` posted | `sceneId`, `sceneName`, `roomId`, `actorId`, `actorName`, `description` |
| `scene:title` | Scene renamed (`PATCH /scenes/:id` with new `name`) | `sceneId`, `oldName`, `newName`, `actorId`, `actorName` |
| `scene:clear` | Scene closed/finished/archived | `sceneId`, `sceneName`, `actorId`, `actorName`, `status` |

`scene:set` and `scene:pose` both fire when a `"set"` pose is posted —
`scene:pose` for anything that needs to see all pose types, `scene:set` for
handlers that only care about scene descriptions.

### Example: AI GM assistant

```typescript
import { gameHooks } from "jsr:@ursamu/ursamu";
import { send } from "../../services/broadcast/index.ts";
import type { SceneSetEvent, SceneTitleEvent, SceneClearEvent } from "jsr:@ursamu/ursamu";

// Narrate the new setting in the GM's voice
gameHooks.on("scene:set", ({ roomId, description }: SceneSetEvent) => {
  send([roomId], `%ch%cm[GM]%cn ${description}`, {});
});

// Announce title changes
gameHooks.on("scene:title", ({ roomId, oldName, newName }: SceneTitleEvent) => {
  // roomId is not in SceneTitleEvent — look it up from sceneId if needed
  console.log(`[GM] Scene renamed: "${oldName}" → "${newName}"`);
});

// Wrap up when a scene closes
gameHooks.on("scene:clear", ({ sceneName, status }: SceneClearEvent) => {
  console.log(`[GM] Scene "${sceneName}" ${status}.`);
});
```

See [Plugin Hooks & Events](/plugins/hooks/) for the complete GameHooks API.

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/scenes` | Required | List visible scenes |
| `POST` | `/api/v1/scenes` | Required | Create a scene |
| `GET` | `/api/v1/scenes/locations` | Required | List accessible rooms |
| `GET` | `/api/v1/scenes/:id` | Required | Scene detail with participants |
| `PATCH` | `/api/v1/scenes/:id` | Required | Update name, desc, status, sceneType, endTime |
| `GET` | `/api/v1/scenes/:id/export` | Required | Export as `?format=markdown` or `?format=json` |
| `POST` | `/api/v1/scenes/:id/pose` | Required | Add a pose, ooc, or set entry |
| `PATCH` | `/api/v1/scenes/:id/pose/:poseId` | Required | Edit a pose (author or scene owner) |
| `POST` | `/api/v1/scenes/:id/join` | Required | Join a scene |
| `POST` | `/api/v1/scenes/:id/invite` | Required | Add a player to the allowed list |
