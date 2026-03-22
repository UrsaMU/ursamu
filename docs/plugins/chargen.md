---
layout: layout.vto
title: Character Generation Plugin
description: How to use and configure the chargen plugin for new player character applications.
nav:
  - text: Overview
    url: "#overview"
  - text: Player Workflow
    url: "#player-workflow"
  - text: Player Commands
    url: "#player-commands"
  - text: Staff Workflow
    url: "#staff-workflow"
  - text: Staff Commands
    url: "#staff-commands"
  - text: Application Statuses
    url: "#application-statuses"
  - text: chargenHooks
    url: "#chargenhooks"
  - text: REST API
    url: "#rest-api"
  - text: Extending Chargen
    url: "#extending-chargen"
---

# Character Generation Plugin

The `chargen` plugin provides a simple application workflow for new players to
submit character backgrounds for staff review before being granted full access.

---

## Overview

Players fill in application fields at their own pace, then submit for review.
Staff review pending applications, approve or reject them, and can leave notes.
When a character is approved, the player receives a mail notification and their
account is fully activated.

The plugin auto-loads when `src/plugins/chargen/` exists. No configuration
is required — just the plugin folder.

---

## Player Workflow

1. Connect to the game as a new, unapproved character
2. Run `+chargen` to see your current application status
3. Fill in fields with `+chargen/set <field>=<value>`
4. Review your application with `+chargen`
5. Submit with `+chargen/submit`
6. Wait for staff review — you'll receive in-game mail when processed

While your application is **pending**, you cannot edit fields. If you need
changes, contact staff and ask them to reopen it.

---

## Player Commands

### `+chargen`

View your current application.

```
> +chargen
========================================= Character Generation =========================================
Status: DRAFT
Player: 42
-------------------------------------------------------------------------------------------------------
name: Alice
concept: A wandering healer from the northern reaches
background: She grew up in...
========================================================================================================
```

### `+chargen/set <field>=<value>`

Set a field on your application. Field names are case-insensitive and stored
lowercase. You can set any field name your game requires — there is no enforced
schema.

```
> +chargen/set name=Alice Lightwood
Set name on your chargen application.

> +chargen/set concept=A wandering healer from the northern reaches
Set concept on your chargen application.

> +chargen/set background=She grew up in the village of Frostmere...
Set background on your chargen application.
```

Limits:
- Field name: max 64 characters
- Field value: max 4,096 characters
- Cannot set fields while application is **pending** or **approved**

### `+chargen/submit`

Submit your application for staff review.

```
> +chargen/submit
Your character application has been submitted for staff review. You will be notified when it is processed.
```

Once submitted, online staff are automatically notified. Your application
status changes to **pending** and you cannot modify it until staff acts.

---

## Staff Workflow

1. Online staff see a notification when a player submits
2. Use `+chargen/staff` to see all pending applications
3. Use `+chargen/view <player>` to read the application
4. Use `+chargen/approve` or `+chargen/reject`
5. Player receives in-game mail with the result

---

## Staff Commands

All staff commands require the `admin`, `wizard`, or `superuser` flag.

### `+chargen/staff`

List all applications with non-draft status (pending, approved, rejected).

```
> +chargen/staff
============================================================
  Player         Status     Submitted
  alice          pending    2026-03-21T14:30:00.000Z
  bob            rejected   2026-03-20T09:15:00.000Z
============================================================
```

### `+chargen/view <player>`

View a player's full application including all fields, timestamps, and any
staff notes.

```
> +chargen/view alice
============================================ Chargen: Alice ============================================
Status:    PENDING
Player:    42
Submitted: 2026-03-21T14:30:00.000Z
-------------------------------------------------------------------------------------------------------
name: Alice Lightwood
concept: A wandering healer from the northern reaches
background: She grew up in the village of Frostmere...
========================================================================================================
```

### `+chargen/approve <player>[=<note>]`

Approve a player's application. An optional note is sent to the player in the
approval mail.

```
> +chargen/approve alice
Approved alice's application.

> +chargen/approve alice=Welcome! Your character has been approved — enjoy the game!
Approved alice's application.
```

On approval:
- Application status → `approved`
- `chargen:approved` hook fires
- Player receives in-game mail with approval message

### `+chargen/reject <player>=<reason>`

Reject a player's application with a reason. The reason is sent to the player.

```
> +chargen/reject bob=Please expand your background section — it's too brief.
Rejected bob's application.
```

On rejection:
- Application status → `rejected`
- `chargen:rejected` hook fires
- Player receives in-game mail with the reason
- Player can update fields and resubmit after staff reopens the application

### `+chargen/reopen <player>`

Reopen a rejected (or approved) application so the player can edit and
resubmit.

```
> +chargen/reopen bob
Reopened bob's chargen application.
```

### `+chargen/delete <player>`

Permanently delete a player's application.

```
> +chargen/delete bob
Deleted bob's chargen application.
```

---

## Application Statuses

```
draft     → pending (player submits)
pending   → approved (staff approves)
pending   → rejected (staff rejects)
rejected  → draft (staff reopens)
approved  → draft (staff reopens)
```

| Status | Player can edit | Staff action |
|--------|----------------|--------------|
| `draft` | Yes | View, delete |
| `pending` | No | View, approve, reject, delete |
| `approved` | No | Reopen, delete |
| `rejected` | No (until reopened) | Reopen, delete |

---

## chargenHooks

Subscribe to chargen lifecycle events in your plugin.

```typescript
import { chargenHooks } from "../../plugins/chargen/mod.ts";

// Notify staff in a Discord channel when a player submits
chargenHooks.on("chargen:submitted", (app) => {
  const playerId = app.data.playerId;
  console.log(`[chargen] New application from player ${playerId}`);
  // send Discord webhook, etc.
});

// Grant starting room or items on approval
chargenHooks.on("chargen:approved", async (app) => {
  const playerId = app.data.playerId;
  // e.g. teleport to starting room, give starting items
});

// Log rejections for audit
chargenHooks.on("chargen:rejected", (app) => {
  console.log(`[chargen] Application rejected: ${app.data.notes}`);
});
```

### Event payloads

| Event | Payload fields |
|-------|---------------|
| `chargen:submitted` | Full application object (`data.playerId`, `data.status`, `data.fields`, `data.submittedAt`) |
| `chargen:approved` | Full application object with `data.reviewedBy`, `data.reviewedAt`, `data.notes` |
| `chargen:rejected` | Full application object with `data.notes` (rejection reason) |
| `chargen:deleted` | Full application object |

---

## REST API

The chargen plugin mounts a REST API at `/api/v1/chargen`. Authentication
required on all endpoints (`Authorization: Bearer <jwt>`).

### GET /api/v1/chargen

Staff only. Lists all applications.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4202/api/v1/chargen
```

Response:
```json
[
  {
    "id": "cg-abc123",
    "data": {
      "playerId": "42",
      "status": "pending",
      "fields": { "name": "Alice", "concept": "A healer" },
      "submittedAt": 1742567400000
    }
  }
]
```

### GET /api/v1/chargen/:id

Staff only. Get a single application.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4202/api/v1/chargen/cg-abc123
```

### PATCH /api/v1/chargen/:id

Staff only. Update an application (approve, reject, reopen).

```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "approved", "notes": "Welcome!"}' \
  http://localhost:4202/api/v1/chargen/cg-abc123
```

### GET /api/v1/chargen/me

Player endpoint. Returns the calling player's own application.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4202/api/v1/chargen/me
```

---

## Extending Chargen

### Add required fields validation

Listen to `chargen:submitted` and auto-reject if required fields are missing:

```typescript
import { chargenHooks } from "../../plugins/chargen/mod.ts";
import { chargenApps } from "../../plugins/chargen/db.ts";

const REQUIRED = ["name", "concept", "background"];

chargenHooks.on("chargen:submitted", async (app) => {
  const missing = REQUIRED.filter(f => !app.data.fields[f]);
  if (missing.length === 0) return;

  // Auto-reject with a message listing missing fields
  await chargenApps.update({ id: app.id }, {
    ...app,
    data: {
      ...app.data,
      status: "rejected",
      notes: `Missing required fields: ${missing.join(", ")}. Please fill these in and resubmit.`,
      reviewedAt: Date.now(),
      reviewedBy: "system",
    },
  });
});
```

### Grant starting gear on approval

```typescript
chargenHooks.on("chargen:approved", async (app) => {
  const { createObj } = await import("jsr:@ursamu/ursamu");

  await createObj({
    name: "Starting Pack",
    flags: new Set(["thing"]),
    location: app.data.playerId,
    state: { desc: "A small pack with basic supplies.", owner: app.data.playerId },
    contents: [],
  });
});
```
