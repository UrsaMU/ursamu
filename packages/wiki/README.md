# @ursamu/wiki

File-based markdown wiki plugin for UrsaMU.

**Version 0.2.1** — content + API. Staff UI is **`@ursamu/web`**.

## Staff UI

Load **`@ursamu/web`** alongside this plugin, then open:

```text
http://localhost:4203/admin/
```

Wiki section: browse, create, edit. See `@ursamu/web` README.

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
