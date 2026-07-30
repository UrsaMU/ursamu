# @ursamu/web

Staff web console for UrsaMU — **Vue 3 + Vite**, **WebSocket-first**.

**Version 0.1.2**

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

### Plugin nav

Plugins call `registerStaffNav()` from `@ursamu/web`.
**Wiki**, **Jobs**, and **Boards** are plugin-owned — not
hard-coded host tabs.

- **`route`** — in-console vue-router name (preferred)
- **`href`** — link-out SPA fallback when no host page exists

Examples:
- Wiki → `route: "wiki"` (in-console `/admin/wiki`)
- Jobs → `route: "jobs"` (in-console `/admin/jobs`)
- BBS → `route: "bbs"` (in-console `/admin/bbs`)

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
| GET/PATCH | `/api/v1/admin/settings` | Safe game/layout fields → `config/config.json` |
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
