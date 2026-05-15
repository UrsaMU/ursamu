---
layout: layout.vto
description: Sharing code and utilities between UrsaMU plugins
---

# Sharing Code Between Plugins

## Overview

UrsaMU resolves plugin **install order** through the `deps[]` array in
`ursamu.plugin.json` (see [ursamu.plugin.json Dependencies](#ursamuplug-injson-dependencies)
below), but there is no `app.plugins.get()` API for cross-plugin code
access at runtime. Plugins share code the same way any TypeScript modules
do: **direct imports**.

This keeps things simple and type-safe. If plugin B needs something from
plugin A, it declares plugin A in `deps[]` so the installer fetches it,
then imports from it directly.
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

Declare transitive plugin dependencies in the `deps[]` array of your
`ursamu.plugin.json`. `ensurePlugins` resolves and installs the graph on
startup:

```json
{
  "name": "jobs-reporter",
  "version": "1.0.0",
  "description": "Generates reports from the jobs plugin",
  "ursamu": ">=1.0.0",
  "author": "Your Name",
  "license": "MIT",
  "deps": [
    { "name": "jobs", "url": "https://github.com/UrsaMU/jobs-plugin", "version": "^1.9.0" }
  ]
}
```

Each entry needs `name` and `url`. The `ref` (git ref) and `version`
(semver range checked against the dep's manifest) fields are optional.
Omit `version` to install the dep without a check — backwards compatible
with manifests written before the range feature shipped.

If any dep fails to clone, fails its `version` range, or has incompatible
ranges across requesters, the entire install run aborts and rolls back —
disk and `.registry.json` are left exactly as they were before the run.
See the [`deps[]` reference](./index.md#deps-entries) for full semantics.
