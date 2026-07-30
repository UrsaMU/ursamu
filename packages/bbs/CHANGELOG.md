# Changelog

## [1.1.0] - 2026-07-30

### Added

- Real board locks: `flag()`, `perm()`, `&&`/`||`/`!`, legacy
  `admin+` ladders (game + REST); `all()` / `faction` unchanged
- `POST /api/v1/boards/:id/posts/:num/replies` — REST replies
- Live board events (`onBbsBoardUpsert` / `Delete`) for staff WS
- Staff console: reply form on post detail; board list live-updates

### Changed

- Staff UI is **only** in-console `@ursamu/web` `/admin/bbs`
  (AppLayout). Nav no longer links to package SPA.
- Package SPA at `/admin/bbs-app/` registers **only** when
  `@ursamu/web` is not installed; never serves `/admin/bbs`


## [1.0.12] - 2026-07-30

### Fixed

- Staff help readable via `+help bbs/staff` (and
  `+help bbs/staff/<cmd>`); removed `dark`/`hidden` on staff
  topics that blocked discovery; tags on all staff command pages


## [1.0.11] - 2026-07-30

### Fixed

- Staff nav badge `bbs:activity` lights on new posts and
  replies (not only flagged posts); clear-on-view still applies
- Replies show the character's **true name**, never moniker
  (stored authorName + display resolve via `data.name`)


## [1.0.10] - 2026-07-30

### Changed

- Staff nav / page title shortened to **Boards** (was
  "Bulletin Board System" — too long for the topbar)


## [1.0.9] - 2026-07-30

### Added

- Live staff badge `bbs:flagged` via `@ursamu/web` `setStaffBadge`
  (Phase 3) — updated on flag/unflag and at plugin bootstrap


## [1.0.8] - 2026-07-30

### Changed

- Staff nav title/description come from plugin identity
  (`BBS_TITLE` / `BBS_DESCRIPTION` in version.ts) — host
  UI no longer hardcodes the display name


## [1.0.7] - 2026-07-30

### Changed

- Staff nav label: **Bulletin Board System** (route `/admin/bbs`)


## [1.0.6] - 2026-07-30

### Changed

- Standalone SPA loads host `/admin/staff-theme.css` first
  (vendor fallback synced from `@ursamu/web`)
- Local styles no longer redefine design tokens


## [1.0.5] - 2026-07-30

### Changed

- Standalone SPA moved to `/admin/bbs-app/` so `@ursamu/web`
  can own in-console `/admin/bbs` (Phase 2)
- `registerStaffNav` uses `route: "bbs"` (in-panel) with
  href fallback to `/admin/bbs-app/`


## [1.0.4] - 2026-07-30

### Added

- Soft-registers topbar entry via `@ursamu/web` `registerStaffNav`
  (Phase 1 plugin nav) when the staff console is installed


## [1.0.3] - 2026-07-29

### Changed

- Staff SPA chrome matches `@ursamu/web` (topbar, tokens,
  gate screens); link back to `/admin/`
- Staff UI remains the package SPA at `/admin/bbs/` — not
  inlined into the web console

## [1.0.2] - 2026-07-29

### Fixed

- Staff login sent `{ name }` but engine expects `{ username }` —
  caused Internal server error on sign-in
- Reuse `@ursamu/web` JWT session key so `/admin/` and `/admin/bbs/`
  share the same sign-in

## [1.0.1] - 2026-07-29

### Fixed

- Staff SPA static handler no longer calls `fromFileUrl` at
  module load — JSR loads use `https://` `import.meta.url` and
  crashed before `init()`. Assets load via `fetch` on JSR and
  `Deno.readFile` for local `file://` checkouts.

## [1.0.0] - 2026-07-29

First stable release. Semver freeze for surfaces in
`docs/STABLE.md` and `docs/REST.md`.

### Compatibility promise

- DBO collections: `server.bboards`, `server.bboard_posts`
- REST prefix: `/api/v1/boards` (see REST.md)
- Staff SPA: `/admin/bbs/`
- Peers: mush ^1.0, help ^1.0, jobs ^1.1.1 (optional)
- Breaking removals of commands, REST routes, or DBO renames
  require a **major** bump

### Includes (from 0.2.0 line)

- Full +bb* command surface (Myrddin UX matrix)
- REST auth helpers + security tests
- Operator README, REST contract, STABLE policy
- In-package staff SPA (`deno task ui:build` → `dist/`)
- Jobs board soft-bridge when `@ursamu/jobs` is present

### Notes

- Replies: create in-game (`+bbreply`); listed on GET post
- Sticky on create: POST then PATCH `{ sticky: true }`
- Softcode installer / color themes remain out of scope

## [0.2.0] - 2026-07-29

### Added

- `src/rest-auth.ts` pure REST helpers + security unit tests
- `docs/REST.md`, operator README, `docs/STABLE.md`
- Staff SPA at `/admin/bbs/`

### Changed

- Jobs peer `^1.1.1`; POST posts checks write lock

## [0.1.1] - 2026-07-28

### Added

- Myrddin gap-fill commands: `+bbnew`, `+bbscan`, `+bbversion`,
  `+bbhelp`, `+bbcolors`, `+bbanon`
- `docs/MYRDDIN.md` command parity matrix
- Help topics for new reading/staff commands
- Depends on `@ursamu/mush@^1.0.0`, `@ursamu/help@^1.0.0`

### Notes

- Softcode object / color-theme parity remains out of scope
  (see MYRDDIN.md non-goals)

## [0.1.0] - 2026

Initial JSR line — Myrddin-style boards, posts, staff tools.
