---
layout: layout.vto
title: Wiki
description: How to create, organize, and manage your game wiki in UrsaMU.
nav:
  - text: Overview
    url: "#overview"
  - text: Directory Structure
    url: "#directory-structure"
  - text: Frontmatter
    url: "#frontmatter"
  - text: In-Game Commands
    url: "#in-game-commands"
  - text: REST API
    url: "#rest-api"
  - text: Static Assets
    url: "#static-assets"
  - text: Hooks
    url: "#hooks"
  - text: Tips
    url: "#tips"
---

# Wiki

Every UrsaMU game project includes a `wiki/` directory at the project root.
Files placed here are immediately available to players via in-game commands and
to external tools via the REST API. No database setup is required — the wiki is
file-based Markdown.

---

## Overview

```
wiki/
├── home.md              ← shown for +wiki home
├── lore/
│   ├── index.md         ← shown for +wiki lore
│   └── factions.md      ← shown for +wiki lore/factions
├── rules.md
└── images/
    └── banner.png       ← served at GET /api/v1/wiki/images/banner.png
```

Players read pages with `+wiki`. Admins and wizards write and edit pages with
`@wiki`. All write operations require the `admin`, `wizard`, or `superuser`
flag.

---

## Directory Structure

Subdirectories become sections. A directory with an `index.md` shows that file
when listed; otherwise the directory listing is shown directly.

```
wiki/lore/index.md   →  +wiki lore         (section overview)
wiki/lore/factions.md →  +wiki lore/factions
wiki/rules.md         →  +wiki rules
```

`README.md` files at any level are ignored by the wiki system — they are for
human readers of the repository only.

---

## Frontmatter

Pages support YAML-ish frontmatter for metadata. The parser supports strings,
numbers, booleans, and inline arrays.

```markdown
---
title: The Iron Pact
author: Storyteller
date: 2026-03-18
tags: [lore, factions, politics]
---

The Iron Pact was forged in the aftermath of the Sundering...
```

| Field | Type | Purpose |
|-------|------|---------|
| `title` | string | Display name shown in listings and page headers |
| `author` | string | Who wrote the page |
| `date` | string | Publication date (any format) |
| `tags` | array | Searchable keywords |

Any additional keys are stored and returned by the API — use them freely for
custom metadata.

---

## In-Game Commands

### Reading: `+wiki`

```
+wiki                       list root-level pages and directories
+wiki <path>                read a page or list a directory
+wiki/search <query>        full-text search (title, body, tags)
```

**Examples:**

```
+wiki                       → root listing
+wiki lore                  → lore/index.md or directory listing
+wiki lore/factions         → lore/factions.md
+wiki/search iron pact      → all pages mentioning "iron pact"
```

### Writing: `@wiki` (admin/wizard only)

```
@wiki/create <path>=<title>/<body>   create a new page
@wiki/edit   <path>=<new body>       replace the body of an existing page
@wiki/fetch  <url>=<wiki-path>       download a remote image into wiki/
```

**Examples:**

```
@wiki/create lore/factions=The Iron Pact/The Iron Pact was forged...
@wiki/edit lore/factions=Updated text about the Iron Pact...
@wiki/fetch https://example.com/banner.png=images/banner.png
```

`@wiki/create` sets `author` and `date` automatically from the acting player.
`@wiki/edit` preserves all existing frontmatter and replaces only the body.
`@wiki/fetch` blocks private/loopback URLs and enforces a 10 MB limit.

---

## REST API

The wiki is exposed at `/api/v1/wiki`. Write operations (`POST`, `PATCH`,
`DELETE`, `PUT`) require a valid session token.

### List all pages

```
GET /api/v1/wiki
```

Returns an array of page stubs:

```json
[
  { "path": "home",           "title": "Home",         "type": "page" },
  { "path": "lore/factions",  "title": "The Iron Pact","type": "page" }
]
```

### Search

```
GET /api/v1/wiki?q=iron+pact
```

Returns matching stubs (title, body, and tag matches).

### Read a page

```
GET /api/v1/wiki/<path>
```

Returns the page's frontmatter fields merged with a `body` key:

```json
{
  "path":   "lore/factions",
  "title":  "The Iron Pact",
  "author": "Storyteller",
  "date":   "2026-03-18",
  "tags":   ["lore", "factions"],
  "body":   "The Iron Pact was forged..."
}
```

If `<path>` is a directory, a listing is returned:

```json
{
  "path": "lore",
  "type": "directory",
  "children": [
    { "path": "lore/factions", "title": "The Iron Pact", "type": "page" }
  ]
}
```

### Create a page

```
POST /api/v1/wiki
Content-Type: application/json

{
  "path":   "lore/factions",
  "title":  "The Iron Pact",
  "tags":   ["lore", "factions"],
  "body":   "The Iron Pact was forged..."
}
```

Returns `201` on success, `409` if the page already exists.

### Update a page

```
PATCH /api/v1/wiki/<path>
Content-Type: application/json

{ "body": "Revised text..." }
```

Only the fields included in the request are changed. Omit `body` to update
metadata only.

### Delete a page

```
DELETE /api/v1/wiki/<path>
```

Removes `<path>.md` or `<path>/index.md`. Returns `{ "deleted": true }`.

---

## Static Assets

Images and PDFs can be stored in the wiki directory and served over HTTP.

### Upload via API

```
PUT /api/v1/wiki/images/banner.png
Content-Type: image/png
<binary body>
```

Maximum upload size is **10 MB**. Supported types:

| Extension | MIME type |
|-----------|-----------|
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.pdf` | `application/pdf` |

### Upload via in-game command

```
@wiki/fetch https://example.com/banner.png=images/banner.png
```

Fetches the remote URL and saves it at `wiki/images/banner.png`. Private and
loopback addresses are blocked.

### Retrieve

```
GET /api/v1/wiki/images/banner.png
```

Returns the raw file with the appropriate `Content-Type` header and a
`Cache-Control: public, max-age=3600` header.

---

## Hooks

Plugins can react to wiki changes by subscribing to `wikiHooks`:

```ts
import { wikiHooks } from "ursamu/plugins/wiki";

wikiHooks.on("wiki:created", (page) => {
  console.log(`New page: ${page.path} — "${page.meta.title}"`);
});

wikiHooks.on("wiki:edited", (page) => {
  console.log(`Updated: ${page.path}`);
});

wikiHooks.on("wiki:deleted", (page) => {
  console.log(`Deleted: ${page.path}`);
});
```

| Event | Fires when |
|-------|------------|
| `wiki:created` | A new page is written (REST or in-game) |
| `wiki:edited` | A page's body or metadata is updated |
| `wiki:deleted` | A page or asset is removed |

---

## Tips

### Use subdirectories to organize content

Flat listings become unwieldy quickly. Group pages by topic:

```
wiki/lore/          world background, factions, history
wiki/rules/         policies, chargen rules, house rules
wiki/staff/         internal notes, plot threads, NPC rosters
wiki/news/          IC announcements, session recaps
```

### Use frontmatter tags for cross-cutting search

Tags are searched alongside title and body, so `+wiki/search faction` finds
every page tagged `factions` even if the word doesn't appear in the body.

### Version your wiki with git

Because the wiki is plain files, it is automatically tracked by git. Staff can
edit pages in their editor and push; the changes are live immediately after the
server reloads.

### The `home.md` convention

The file `wiki/home.md` is created automatically when you scaffold a new
project. Treat it as the entry point — link from it to your major sections so
that `+wiki home` gives new players an orientation.
