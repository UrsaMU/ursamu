---
layout: layout.vto
description: Using DBO<T> to store and query plugin data in UrsaMU
---

# Plugin Database

## Overview

UrsaMU's database layer is built on Deno KV. The generic class `DBO<T>`
provides a typed CRUD interface for any collection. Each plugin creates its own
named collections that live in the shared KV store, isolated by key prefix.
---

## Defining a Collection

Create a `db.ts` file in your plugin directory:

```typescript
// src/plugins/my-plugin/db.ts
import { DBO } from "../../services/Database/database.ts";

export interface IMyRecord {
  id: string;
  playerId: string;
  text: string;
  createdAt: number;   // ms timestamp
}

// The collection key must be globally unique — prefix with your plugin name
// (e.g. "my-plugin.records") so it cannot collide with engine collections or
// other plugins. The legacy "server." prefix is reserved for core engine
// collections like dbojs, counters, chans, mail, etc.
export const myRecords = new DBO<IMyRecord>("my-plugin.records");
```

Import the collection wherever you need it:

```typescript
import { myRecords } from "./db.ts";
```
---

## DBO Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `create(record: T): Promise<T>` | Insert a record, returns the created object |
| `queryOne` | `queryOne(query: Partial<T>): Promise<T \| undefined>` | First match or `undefined` |
| `find` | `find(query: Partial<T>): Promise<T[]>` | All matching records |
| `update` | `update(query: Partial<T>, record: T): Promise<void>` | Replace a record (matched by `id`) |
| `modify` | `modify(query: Partial<T>, op: "$set", data: Partial<T>): Promise<void>` | Partial field update |
| `delete` | `delete(query: Partial<T>): Promise<void>` | Delete all matching records |
| `all` | `all(): Promise<T[]>` | Return every record in the collection |

> **Update vs Modify**: `update({}, record)` replaces the full document.
> `modify({ id }, "$set", { field: value })` updates only the listed fields.
---

## Querying

Pass any subset of fields as the query object. All fields in the query must
match (logical AND). An empty object `{}` matches everything.

```typescript
// Find all records for a specific player
const mine = await myRecords.find({ playerId: "p123" });

// Find the first record with a specific id
const one = await myRecords.queryOne({ id: "rec-7" });

// All records
const all = await myRecords.all();
```
---

## Built-in Collections

The core engine exposes these pre-defined collections from
`src/services/Database/index.ts`:

| Export | KV Key | Contents |
|--------|--------|----------|
| `dbojs` | `server.objects` | All game objects (players, rooms, exits, things) |
| `counters` | `server.counters` | Auto-increment sequences |
| `chans` | `server.chans` | Communication channels |
| `mail` | `server.mail` | In-game mail messages |
| `bboard` | `server.bboard` | Bulletin board posts |
| `scenes` | `server.scenes` | Scene logs |

```typescript
import { dbojs, counters } from "../../services/Database/index.ts";

// Find a player by name
const player = await dbojs.queryOne({ data: { name: "Alice" } });

// Find all objects in a room
const contents = await dbojs.find({ location: roomId });
```
---

## Sequential IDs

Use the `counters` collection to generate monotonically increasing numbers
(e.g., ticket #1, event #2):

```typescript
import { counters } from "../../services/Database/index.ts";

export async function getNextId(namespace: string): Promise<number> {
  const row = await counters.queryOne({ id: namespace });
  if (!row) {
    await counters.create({ id: namespace, seq: 1 });
    return 1;
  }
  const next = row.seq + 1;
  await counters.modify({ id: namespace }, "$set", { seq: next });
  return next;
}
```

Call it with a unique namespace per plugin:

```typescript
const num = await getNextId("my-plugin.tickets");
```
---

## Full Example

A plugin that lets players save short bookmarks:

```typescript
// db.ts
import { DBO } from "../../services/Database/database.ts";

export interface IBookmark {
  id: string;
  playerId: string;
  playerName: string;
  label: string;
  url: string;
  createdAt: number;
}

export const bookmarks = new DBO<IBookmark>("server.bookmarks");
```

```typescript
// commands.ts
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { bookmarks } from "./db.ts";

addCmd({
  name: "+bookmark",
  pattern: /^\+bookmark(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase();
    const arg = (u.cmd.args[1] || "").trim();

    // +bookmark/list
    if (sw === "list") {
      const mine = await bookmarks.find({ playerId: u.me.id });
      if (!mine.length) { u.send("No bookmarks saved."); return; }
      for (const b of mine) u.send(`[${b.id.slice(-4)}] ${b.label} — ${b.url}`);
      return;
    }

    // +bookmark/delete <id>
    if (sw === "delete") {
      const b = await bookmarks.queryOne({ id: arg, playerId: u.me.id });
      if (!b) { u.send("Bookmark not found."); return; }
      await bookmarks.delete({ id: b.id });
      u.send("Deleted.");
      return;
    }

    // +bookmark <label>=<url>
    const eq = arg.indexOf("=");
    if (eq === -1) { u.send("Usage: +bookmark <label>=<url>"); return; }
    const label = arg.slice(0, eq).trim();
    const url   = arg.slice(eq + 1).trim();
    if (!label || !url) { u.send("Usage: +bookmark <label>=<url>"); return; }

    await bookmarks.create({
      id:         crypto.randomUUID(),
      playerId:   u.me.id,
      playerName: u.me.name || u.me.id,
      label,
      url,
      createdAt:  Date.now(),
    });
    u.send(`Bookmark "${label}" saved.`);
  },
});
```
