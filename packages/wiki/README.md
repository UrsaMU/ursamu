# @ursamu/wiki

File-based markdown wiki plugin for UrsaMU.

**Version 0.2.6** — content + API + on-server page images.

## Staff UI

Load **`@ursamu/web`** alongside this plugin. Wiki registers the
topbar tab (`route: "wiki"` → `/admin/wiki`) and a drafts badge.

```text
http://localhost:4203/admin/wiki
```

Browse, create, edit. See `@ursamu/web` README.

## Page images (on-server)

Articles can embed multiple images without hotlinking. Staff
upload a file or paste a remote URL; the wiki stores the bytes
and serves them from this host.

| | |
|--|--|
| **Disk** | `wiki/<page>/_assets/<name.ext>` |
| **URL** | `/api/v1/wiki/<page>/_assets/<name.ext>` |
| **Markdown** | `![crest](crest.png)` — bare filename (preferred) |

The public reader expands short refs using the current page path.
Full `/api/v1/wiki/…` URLs and external `https://…` still work.

REST (staff JWT):

```text
GET    /api/v1/wiki/<page>/media
POST   /api/v1/wiki/<page>/media   multipart file=…  or  {"url":"https://…"}
DELETE /api/v1/wiki/<page>/media/<name>
```

Allowed types: `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg`
(max 10 MB). URL import blocks private/loopback hosts (SSRF).

In-game: `@wiki/fetch <url>=<wiki-path>` still works for any
allowed media path (including `_assets/…`).

## Who can read a page (`readLock`)

| Value | In-game (`+wiki`) | REST / future public site |
|-------|-------------------|---------------------------|
| **`public`** | Any connected player | **Anyone** (no login) |
| **`connected`** (default) | Any connected player | Logged-in players only |
| **`staff`** / **`admin`** | Staff flags | Staff JWT only |
| **`faction:<id>`** | In that object's contents | Same |

**Drafts** are always staff-only, even if `readLock: public`.

Surfaces today:

- **In-game** — `+wiki` / `@wiki` (players must be connected to run commands)
- **Staff web** — `@ursamu/web` at `/admin/` (admin+ login)
- **REST** — `GET /api/v1/wiki` and `GET /api/v1/wiki/<path>` honor
  `readLock` (anonymous callers only see `public` non-draft pages)
- **Public reader SPA** — not shipped yet; design notes call it out as
  future chrome. Until then, public pages are readable via the API.

## Configuration

This plugin supports custom database collection names. In your `config.json`,
you can customize the collection name:

```json
{
  "plugins": {
    "wiki": {
      "db": "wiki.subscriptions"
    }
  }
}
```
