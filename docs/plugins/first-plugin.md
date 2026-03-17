---
layout: layout.vto
description: Create your first UrsaMU plugin with this step-by-step guide
nav:
  - text: Scaffold the Plugin
    url: "#scaffold-the-plugin"
  - text: File Walkthrough
    url: "#file-walkthrough"
  - text: Test It
    url: "#test-it"
  - text: Publish It
    url: "#publish-it"
  - text: Next Steps
    url: "#next-steps"
---

# Creating Your First Plugin

This guide walks through creating a working UrsaMU plugin from scratch. We'll
build a **notes plugin** — players can save short notes, list them, and delete
them, both in-game and through the REST API.

## Scaffold the Plugin

Run this from your game project root:

```bash
ursamu create plugin notes
```

This creates `src/plugins/notes/` with four pre-wired files:

```
src/plugins/notes/
├── index.ts      — plugin entry point
├── commands.ts   — in-game +notes command
├── router.ts     — REST handler for /api/v1/notes
└── db.ts         — custom DBO database
```

The plugin is already auto-discovered. Restart the server and it loads.

---

## File Walkthrough

### db.ts — Define your data shape

Replace the generated stub with a `INote` type:

```typescript
import { DBO } from "../../services/Database/database.ts";

export interface INote {
  id: string;
  author: string;        // player ID
  authorName: string;
  text: string;
  createdAt: number;     // ms timestamp
}

export const notes = new DBO<INote>("server.notes");
```

### commands.ts — In-game commands

```typescript
import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { notes } from "./db.ts";

addCmd({
  name: "+note",
  pattern: /^\+note(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase();
    const arg = (u.cmd.args[1] || "").trim();

    // +note/list
    if (sw === "list") {
      const mine = await notes.find({ author: u.me.id });
      if (!mine.length) { u.send("You have no notes."); return; }
      for (const n of mine) u.send(`[${n.id.slice(-6)}] ${n.text}`);
      return;
    }

    // +note/delete <id>
    if (sw === "delete") {
      const note = await notes.queryOne({ id: arg });
      if (!note) { u.send("Note not found."); return; }
      if (note.author !== u.me.id) { u.send("That is not your note."); return; }
      await notes.delete({ id: note.id });
      u.send("Deleted.");
      return;
    }

    // +note <text>
    if (!arg) { u.send('Usage: +note <text>  or  +note/list  or  +note/delete <id>'); return; }

    const note = await notes.create({
      id:         crypto.randomUUID(),
      author:     u.me.id,
      authorName: u.me.name || u.me.id,
      text:       arg,
      createdAt:  Date.now(),
    });
    u.send(`Saved [${note.id.slice(-6)}].`);
  },
});
```

**In-game usage:**
```
+note Remember to update the wiki
+note/list
+note/delete <id>
```

### router.ts — REST endpoints

```typescript
import { dbojs } from "../../services/Database/index.ts";
import { notes } from "./db.ts";

const H = { "Content-Type": "application/json" };
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: H });

export async function notesRouteHandler(
  req: Request,
  userId: string | null
): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const { pathname } = new URL(req.url);

  // GET /api/v1/notes — list my notes
  if (pathname === "/api/v1/notes" && req.method === "GET") {
    return json(await notes.find({ author: userId }));
  }

  // POST /api/v1/notes — create a note
  if (pathname === "/api/v1/notes" && req.method === "POST") {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "text is required" }, 400);

    const player     = await dbojs.queryOne({ id: userId });
    const authorName = (player && player.data?.name) || userId;

    const note = await notes.create({
      id:         crypto.randomUUID(),
      author:     userId,
      authorName,
      text,
      createdAt:  Date.now(),
    });
    return json(note, 201);
  }

  // DELETE /api/v1/notes/:id
  const m = pathname.match(/^\/api\/v1\/notes\/(.+)$/);
  if (m && req.method === "DELETE") {
    const note = await notes.queryOne({ id: m[1] });
    if (!note)               return json({ error: "Not found" }, 404);
    if (note.author !== userId) return json({ error: "Forbidden" }, 403);
    await notes.delete({ id: note.id });
    return json({ deleted: true });
  }

  return json({ error: "Not Found" }, 404);
}
```

### index.ts — Wire it together

```typescript
import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { notesRouteHandler } from "./router.ts";
import "./commands.ts";

const notesPlugin: IPlugin = {
  name: "notes",
  version: "1.0.0",
  description: "Player notes — in-game commands and REST API",

  init: async () => {
    registerPluginRoute("/api/v1/notes", notesRouteHandler);
    console.log("[notes] initialized");
    return true;
  },

  remove: async () => {
    console.log("[notes] removed");
  },
};

export default notesPlugin;
```

---

## Test It

Start (or restart) the server:

```bash
deno task server
```

**In-game:**

```
+note This is my first note
+note/list
+note/delete <id>
```

**Via REST:**

```bash
# Get a token first
TOKEN=$(curl -s -X POST http://localhost:4203/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","password":"yourpassword"}' | jq -r .token)

# Create a note
curl -s -X POST http://localhost:4203/api/v1/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from the API"}' | jq

# List notes
curl -s http://localhost:4203/api/v1/notes \
  -H "Authorization: Bearer $TOKEN" | jq

# Delete a note
curl -s -X DELETE http://localhost:4203/api/v1/notes/<id> \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Publish It

If you want to share your plugin on GitHub so others can install it with
`ursamu plugin install`, add a manifest file to the plugin directory:

```json
{
  "name": "notes",
  "version": "1.0.0",
  "description": "Player notes — in-game commands and REST API",
  "ursamu": ">=1.0.0",
  "author": "Your Name",
  "license": "MIT",
  "main": "index.ts"
}
```

Save it as `ursamu.plugin.json`. Users can then install your plugin with:

```bash
ursamu plugin install https://github.com/you/ursamu-notes
```

To create a standalone, publish-ready plugin project from scratch (with
`deno.json`, tests, `.gitignore`, and `ursamu.plugin.json` pre-generated):

```bash
ursamu create plugin notes --standalone
```

---

## Next Steps

- `src/plugins/jobs/` — a real-world example with staff permission checks and complex REST routes
- `src/plugins/bboards/` — per-user unread state across multiple resources
- `src/plugins/events/` — sequential IDs, RSVP capacity enforcement, event status visibility
- [Plugin Reference](./index.md) — full `IUrsamuSDK` and `DBO<T>` API tables
- [Plugin Events](./hooks.md) — subscribing and emitting game events
