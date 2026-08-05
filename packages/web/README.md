# @ursamu/web

Staff web console for UrsaMU — **Vue 3 + Vite**, **WebSocket-first**.

**Version 0.2.37**

## Open

```text
http://localhost:4203/admin/
```

Legacy `/admin/wiki/` still serves the same SPA.

## Architecture

After login, **all console data goes over one WebSocket**:

```text
GET /admin/ws?token=<jwt>
```

| Direction | Message | Purpose |
|-----------|---------|---------|
| ← | `hello` | Auth OK |
| ← | `snapshot` | Full lists + `/me` |
| → | `req` `{id,method,path,body?}` | REST-shaped RPC |
| ← | `res` `{id,status,data}` | RPC reply |
| ← | `wiki:*` / `job:*` / `object:*` / `online:set` | Live push |
| → / ← | `ping` / `pong` | Keepalive |

### Hook-driven live push

Pushes come from the engine hook bus — not from polling:

| Hook source | Events | Admin WS message |
|-------------|--------|------------------|
| `gameHooks` | `player:login` / `logout` | `online:set` + `object:upsert` |
| `gameHooks` | `session:close` / `session:auth` | `online:set` (when needed) |
| `gameHooks` | `object:created` / `modified` / `moved` | `object:upsert` |
| `gameHooks` | `object:destroyed` | `object:delete` |
| `gameHooks` | `player:move` | `object:upsert` (location) |
| `wikiHooks` | `wiki:created` / `edited` / … | `wiki:upsert` / `delete` |
| `jobHooks` | `job:created` / `assigned` / … | `job:upsert` / `delete` |

Staff PATCH via `/api/v1/dbobj` emits `object:modified` so in-game
edits and console edits share the same path.

**HTTP is only used for:**

- `POST /api/v1/login` — obtain JWT
- Static SPA assets under `/admin/`

There is **no polling**. Reconnect with exponential backoff; server
re-sends a snapshot on each successful auth.

## Sections

| Route | Purpose |
|-------|---------|
| `/admin/` | Dashboard |
| `/admin/wiki` | Wiki list (`@ursamu/wiki` nav) |
| `/admin/wiki/new` | Create page |
| `/admin/wiki/edit/*` | Edit + Ctrl/⌘+S |
| `/admin/players` | Players |
| `/admin/jobs` | Jobs queue (`@ursamu/jobs` nav) |
| `/admin/bbs` | Boards (`@ursamu/bbs` nav) |
| `/admin/bbs-app/` | BBS standalone SPA if web missing |

### Plugin nav + pages

Plugins call `registerStaffPage()` (or legacy `registerStaffNav()`)
from `@ursamu/web`. **Wiki**, **Jobs**, and **Boards** are
plugin-owned — not hard-coded host tabs.

| Field | Use |
|-------|-----|
| `route` | Host vue-router name (first-party views in the SPA) |
| `embed` | In-console iframe src — host opens `/admin/ext/<id>` |
| `href` | Link-out when there is no in-console page |

```ts
// Third-party / game plugin — no host rebuild
const web = await import("@ursamu/web");
web.registerStaffPage({
  id: "mytool",
  label: "My Tool",
  embed: "/admin/mytool/",
  order: 55,
});
web.registerStaffStatic({
  id: "mytool",
  root: new URL("./admin/", import.meta.url),
});
// Optional left side-nav (query forwarded into the iframe)
web.registerStaffSideNav({
  pageId: "mytool",
  groups: [{
    items: [
      { id: "home", label: "Home" },
      { id: "open", label: "Open", query: { tab: "open" } },
    ],
  }],
});
// Cross-origin embed (optional):
// embed: "https://ops.example.com/ui",
// embedOrigin: "https://ops.example.com",
// Same-origin Vue ESM (optional — host addRoute):
// module: "/admin/mytool/host-entry.js",
// Serve admin/index.html at /admin/mytool/
// Load /admin/staff-theme.css in that HTML.
// Child may listen for postMessage { type: "staff-embed/v1", event: "query" }.
```

### Graduate embed → host Vue

```bash
cd packages/web
# dry-run
deno task import-plugin ../path/to/plugin --route mytool --order 55
# copy/create view + patch router + patch plugin bridge
deno task import-plugin ../path/to/plugin --route mytool --apply
deno task ui:build
# optional: keep embed as fallback while migrating
deno task import-plugin ../path/to/plugin --route mytool --apply --keep-embed
```

### Deploy hygiene

```bash
cd packages/web
deno task ui:build
deno task preflight:ui   # dist assets, staff-theme, router names
```

### Host ESM demo (bundled vue)

```bash
cd packages/web/examples/host-module
npm install && npm run build
# → examples/dist/host-entry.js
```

### Live chrome push

Registering or unregistering staff nav / side-nav broadcasts
`{ type: "staff:chrome", staffNav, staffSideNav }` on the admin WS
so open consoles update without reconnect.

### Soft bridge (first-party + third-party)

```ts
const web = await import("@ursamu/web");
await web.softRegisterStaffPage?.({
  id: "jobs",
  label: "Jobs",
  route: "jobs",
  order: 40,
});
```

Sample ESM host module: `examples/host-entry.js` (vue peer ^3.5).

First-party (in-host Vue):

```ts
web.registerStaffPage({
  id: "jobs",
  label: "Jobs",
  route: "jobs",
  order: 40,
  badgeKey: "jobs:open",
});
```

Examples:
- Wiki → `route: "wiki"` (in-console `/admin/wiki`)
- Jobs → `route: "jobs"` (in-console `/admin/jobs`)
- BBS → `route: "bbs"` (in-console `/admin/bbs`)
- Game tool → `embed: "/admin/mytool/"` + `registerStaffStatic`

### Live badges (Phase 3)

Plugins push counts with `setStaffBadge(key, count, title?)`.
Values appear on nav chips when `StaffNavItem.badgeKey` matches.
Pushed over admin WS as `{ type: "badge:set", key, value, title? }`
and included in the auth snapshot as `staffBadges`.

**Clear on view:** opening a top-level tab acknowledges its
badge keys (client-side, `sessionStorage`). The chip hides for
that exact count and reappears only when the value changes
again (new activity).

### Plugin UI / CSS (host-owned)

The console owns look-and-feel. Plugins must not invent a second theme.

| Asset | URL / path |
|-------|------------|
| Theme CSS | `GET /admin/staff-theme.css` |
| Source | `ui/src/assets/staff-theme.css` |
| Spec | [`design.md`](./design.md) § Plugin UI contract |

**Rules (short):**

1. Use `var(--…)` tokens from the host theme — never redefine them.
2. Prefer `.staff-*` utility classes for buttons, panels, rows, text.
3. Scoped CSS = layout only (grid/spacing).
4. Standalone SPAs load `/admin/staff-theme.css` first; keep a
   synced vendor copy for games without `@ursamu/web`.
5. After editing tokens: `deno task theme:sync` (and rebuild UIs).

| `/admin/db` | DB browser |
| `/admin/settings` | Game config, plugins, soft-restart |

Sign in with game credentials. Requires `admin`, `wizard`, or
`superuser`.

### Settings & plugins

Staff API (also via admin WS RPC):

| Method | Path | Purpose |
|--------|------|---------|
| GET/PATCH | `/api/v1/admin/settings` | Safe game/layout/site fields → `config/config.json` |
| | | Site: `plugins.site.skin`, title, banner, plainBg (live via `@ursamu/site`) |
| GET | `/api/v1/admin/site/themes` | Builtin + zip-installed FE themes |
| POST | `/api/v1/admin/site/theme` | Upload Court-style theme `.zip` (multipart `file`) or `{ "activate": "id" }` |
| POST | `/api/v1/admin/restart` | Soft-reboot (`{ confirm:"restart" }`, exit 75) |
| GET | `/api/v1/admin/plugins` | Loaded plugins + JSON inventory |

**Plugin JSON discovery**

| Location | Role |
|----------|------|
| `<plugin>/resources/…` | Package data (skills, merits, AI, …) |
| `config/plugins/…` | Game-local overrides |
| `config.json` → `plugins.*` | Inline keys |

Looks under `vendor/`, `packages/`, monorepo `packages/`, and
`node_modules/@ursamu/`.


## Develop UI

```bash
cd packages/web/ui
npm install
npm run dev          # http://localhost:5173/admin/ (API → :4203)
```

Vite proxies `/api` and `/admin/ws` to the game HTTP port.

## Build UI

```bash
cd packages/web/ui && npm run build:fast   # → packages/web/dist/
```

## Install (game config)

```json
{
  "server": {
    "plugins": [
      "@ursamu/wiki",
      "@ursamu/jobs",
      "@ursamu/web"
    ]
  }
}
```

```json
{
  "imports": {
    "@ursamu/web": "../ursamu/packages/web/mod.ts"
  }
}
```

## Stack

- Vue 3 + Vue Router + Pinia
- Deno plugin serves `dist/` + `/admin/ws`
- RPC reuses existing REST handlers via `handleRequest`
