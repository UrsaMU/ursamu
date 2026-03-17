---
layout: layout.vto
description: Sharing code and utilities between UrsaMU plugins
nav:
  - text: Overview
    url: "#overview"
  - text: Sharing Utilities
    url: "#sharing-utilities"
  - text: Importing from Another Plugin
    url: "#importing-from-another-plugin"
  - text: Shared Database Collections
    url: "#shared-database-collections"
  - text: Coordination via Events
    url: "#coordination-via-events"
  - text: ursamu.plugin.json Dependencies
    url: "#ursamu-plugin-json-dependencies"
---

# Sharing Code Between Plugins

## Overview

UrsaMU does not have a formal runtime dependency resolver — there is no
`dependencies` array on `IPlugin` and no `app.plugins.get()` API. Instead,
plugins share code the same way any TypeScript modules do: **direct imports**.

This keeps things simple and type-safe. If plugin B needs something from
plugin A, it imports it.

---

## Sharing Utilities

The cleanest pattern is a **shared utility module** that both plugins import.
Put it in a neutral location like `src/plugins/shared/` or a dedicated
`src/lib/` folder:

```typescript
// src/plugins/shared/format.ts
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}
```

Any plugin can import from it:

```typescript
import { formatTimestamp } from "../shared/format.ts";
```

---

## Importing from Another Plugin

If plugin B genuinely depends on plugin A's types or database collections,
import directly from plugin A:

```typescript
// src/plugins/event-rsvp-exporter/commands.ts
import { gameEvents, eventRsvps } from "../events/db.ts";
import type { IGameEvent } from "../../@types/IGameEvent.ts";

// Now this plugin can read event and RSVP data
const ev = await gameEvents.queryOne({ number: 1 });
```

**Things to keep in mind:**

- If plugin A is not installed, the import will fail at startup. Document this
  requirement clearly in your plugin's `ursamu.plugin.json` description and
  README.
- Prefer importing **types and DBO collections** rather than importing
  `commands.ts` or `index.ts`, since those have side effects (command
  registration, plugin init).

---

## Shared Database Collections

If two plugins need to read or write the same data, the cleanest approach is
to extract the `DBO<T>` definition into a shared module that both import:

```typescript
// src/plugins/shared/jobsDb.ts
import { DBO } from "../../services/Database/database.ts";

export interface IJob {
  id: string;
  title: string;
  status: "open" | "in-progress" | "closed";
  createdAt: number;
}

export const jobs = new DBO<IJob>("server.jobs");
```

Both the `jobs` plugin and a hypothetical `jobs-reporter` plugin import from
`shared/jobsDb.ts`. The KV store is shared automatically since both collections
use the same key (`"server.jobs"`).

---

## Coordination via Events

When plugins need **loose coupling** — where plugin B reacts to what plugin A
does without importing from it directly — use `EventsService`:

```typescript
// Plugin A emits an event
import { EventsService } from "../../services/Events/index.ts";

await EventsService.getInstance().emit(
  "jobs.status-changed",
  { jobId: job.id, newStatus: job.status },
);
```

```typescript
// Plugin B subscribes without knowing about Plugin A's internals
import { EventsService } from "../../services/Events/index.ts";

const svc = EventsService.getInstance();
await svc.subscribe(
  "jobs.status-changed",
  `u.send("Job " + event.jobId + " is now " + event.newStatus);`,
  "world",
);
```

This pattern is preferred when the dependency is optional or when you want
Plugin B to work even if Plugin A is not installed.

---

## ursamu.plugin.json Dependencies

While there is no runtime dependency resolver, you can document required
plugins in `ursamu.plugin.json` for human readers and future tooling:

```json
{
  "name": "jobs-reporter",
  "version": "1.0.0",
  "description": "Generates reports from the jobs plugin",
  "ursamu": ">=1.0.0",
  "author": "Your Name",
  "license": "MIT",
  "requires": ["jobs"]
}
```

The `requires` field is informational only — `ursamu plugin install` displays
it so operators know what to install first. It does not affect load order.
