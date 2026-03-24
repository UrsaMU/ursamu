---
layout: layout.vto
title: Events Plugin
description: In-game event calendar with RSVP tracking, staff management, and REST API.
---

# Events Plugin

The `events` plugin provides an in-game event calendar with RSVP tracking.
Players can browse upcoming events and reserve spots. Staff create and manage
events.

> **Note:** This is the *event calendar* plugin (`+event` commands). It is
> separate from `u.events`, the server-wide pub/sub system.
---

## Overview

Events have a title, description, date/time, optional location and capacity,
and a status. Players can RSVP as attending, maybe, or declined.

The plugin auto-loads when `src/plugins/events/` exists. No configuration needed.
---

## Player Commands

### `+event` / `+event/list`

List all upcoming (and active) events.

```
> +event
+events
  #   Title                         Date                 RSVPs   Status
--------------------------------------------------------------------
  1   Midsummer Festival            2026-06-21 20:00       5/20  upcoming
  2   Guild Hall Opening            2026-04-01 19:00          3  upcoming
Use "+event/view <#>" to see details and RSVP.
```

Cancelled events are hidden unless you are staff.

### `+event/view <#>`

View event details and the full RSVP list.

```
> +event/view 1
+event #1: Midsummer Festival
  Status  : upcoming
  Date    : 2026-06-21 20:00
  Where   : The Grand Courtyard
  Tags    : festival, seasonal
  Host    : Gwyneira
  Desc    : Annual midsummer celebration with music and dancing.
  RSVPs:  5/20 attending, 2 maybe
    Attending: Alice, Bob, Carol, Diana, Eve
    Maybe    : Frank, Grace
  Use "+event/rsvp 1" to RSVP, "+event/rsvp 1=maybe" for maybe.
```

### `+event/rsvp <#>[=attending|maybe|decline]`

RSVP to an event. Default status is `attending`.

```
> +event/rsvp 1
RSVP'd attending for "Midsummer Festival".

> +event/rsvp 1=maybe
RSVP updated to maybe for "Midsummer Festival".

> +event/rsvp 1=decline
RSVP updated to declined for "Midsummer Festival".
```

If the event has a `maxAttendees` cap and it's full, attending RSVPs are blocked.

### `+event/unrsvp <#>`

Cancel your RSVP.

```
> +event/unrsvp 1
RSVP cancelled for "Midsummer Festival".
```
---

## Staff Commands

All staff commands require `admin`, `wizard`, or `superuser` flag.

### `+event/create <title>=<date>/<description>`

Create a new event. Date format: `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`.

```
> +event/create Midsummer Festival=2026-06-21 20:00/Annual midsummer celebration with music and dancing.
+event: Event #1 "Midsummer Festival" created for 2026-06-21 20:00.
```

### `+event/edit <#>/<field>=<value>`

Edit any event field.

```
> +event/edit 1/location=The Grand Courtyard
+event: Event #1 field "location" updated.

> +event/edit 1/maxAttendees=20
+event: Event #1 field "maxAttendees" updated.

> +event/edit 1/tags=festival,seasonal
+event: Event #1 field "tags" updated.

> +event/edit 1/endTime=2026-06-21 23:00
+event: Event #1 field "endTime" updated.
```

Editable fields:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Event name |
| `description` | string | Full description |
| `location` | string | Where it's happening |
| `startTime` | date string | `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` |
| `endTime` | date string | Optional end time |
| `tags` | comma-separated | Comma-separated tag list |
| `maxAttendees` | number | 0 = unlimited |
| `status` | status string | See status table |

### `+event/cancel <#>`

Mark an event as cancelled. Cancelled events are hidden from players.

```
> +event/cancel 1
+event: Event #1 "Midsummer Festival" cancelled.
```

### `+event/delete <#>`

Permanently delete an event and all its RSVPs.

```
> +event/delete 1
+event: Event #1 "Midsummer Festival" deleted.
```

### `+event/status <#>=<status>`

Set a status explicitly. Useful for marking events as active or completed.

```
> +event/status 1=active
+event: Event #1 status set to active.

> +event/status 1=completed
+event: Event #1 status set to completed.
```
---

## Event Statuses

| Status | Visible to players | RSVP allowed |
|--------|-------------------|-------------|
| `upcoming` | Yes | Yes |
| `active` | Yes | Yes |
| `completed` | Yes | No |
| `cancelled` | No (staff only) | No |
---

## eventHooks

Subscribe to event lifecycle changes in your plugin.

```typescript
import { eventHooks } from "../../plugins/events/hooks.ts";

// Notify Discord when an event is created
eventHooks.on("event:created", ({ eventId, name, startTime, createdBy }) => {
  console.log(`[events] New event "${name}" created by ${createdBy}`);
});

// Track RSVPs for reporting
eventHooks.on("event:rsvp", ({ eventId, playerId, status }) => {
  console.log(`[events] ${playerId} RSVPd ${status} to event ${eventId}`);
});

// Announce cancellations to all players
eventHooks.on("event:cancelled", async ({ eventId, name }) => {
  // Broadcast or send mail to all RSVPd players
});
```

### Event payloads

| Event | Key payload fields |
|-------|------------------|
| `event:created` | `eventId`, `name`, `startTime`, `createdBy` |
| `event:updated` | `eventId`, `changes` |
| `event:deleted` | `eventId` |
| `event:started` | `eventId`, `name` |
| `event:ended` | `eventId`, `name` |
| `event:rsvp` | `eventId`, `playerId`, `status` |
| `event:cancelled` | `eventId`, `name` |
---

## REST API

The events plugin mounts a REST API at `/api/v1/events`. Authentication
required on all endpoints (`Authorization: Bearer <jwt>`).

### GET /api/v1/events

List all events. Staff see cancelled events; players do not.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4202/api/v1/events
```

Response:
```json
[
  {
    "id": "ev-1",
    "number": 1,
    "title": "Midsummer Festival",
    "description": "Annual midsummer celebration.",
    "startTime": 1750536000000,
    "location": "The Grand Courtyard",
    "tags": ["festival", "seasonal"],
    "maxAttendees": 20,
    "status": "upcoming",
    "createdByName": "Gwyneira"
  }
]
```

### GET /api/v1/events/:id

Get a single event with its RSVP list.

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:4202/api/v1/events/ev-1
```

### POST /api/v1/events

Staff only. Create a new event.

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Guild Meeting",
    "description": "Monthly guild meeting.",
    "startTime": 1750536000000
  }' \
  http://localhost:4202/api/v1/events
```

### PATCH /api/v1/events/:id

Staff only. Update an event.

```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled"}' \
  http://localhost:4202/api/v1/events/ev-1
```

### DELETE /api/v1/events/:id

Staff only. Delete an event.

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4202/api/v1/events/ev-1
```

### POST /api/v1/events/:id/rsvp

RSVP to an event (as the authenticated player).

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "attending"}' \
  http://localhost:4202/api/v1/events/ev-1/rsvp
```

### DELETE /api/v1/events/:id/rsvp

Cancel RSVP.

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4202/api/v1/events/ev-1/rsvp
```
