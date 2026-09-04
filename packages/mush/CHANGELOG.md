## 1.0.37

- `moveObject`: teleport/home leave+arrive + auto-look;
  room sends use socket ids (exclude honored).
- Softcode `#slug` dbrefs (not only `#digits`); tags still work.
- Softcode / `@cemit` deliver via `rooms.broadcast` + channel header.
- look: empty `db.search` must not wipe preloaded contents
  (dark exits / flag-code look tests).
- Depends on `@ursamu/core@^1.0.3` (NAWS / term size).

## 1.0.36

- Softcode eval errors surface as `#-1 …` (never echo input).
- `attr(name,>N)` lock comparisons; case-insensitive keys.
- NAWS width/height → session + player; `width()`/`height()`
  softcode; telnet word-wrap uses live termWidth.

## 1.0.35

- Softcode `get` / `xget` / `u` / `hasattr` walk `@parent`
  chains (same resolver as exit msgs / world layer).
- Shared `getAttribute` / `getAttributeValue` in
  `world/get-attribute.ts`; `no_inherit` stops the walk.
- `$pattern` and `^pattern` dispatch also scan parents.
- SDK `u.trigger` / `u.eval` resolve attrs via parent walk.

## 1.0.34

- Shared interactive command UI helpers (`cmd-ui.ts`):
  `sendListLayout`, `sendCmdLayout`, `lookAction`, builders.
- Theme: `plugins.globals.theme.cmdUi.lookOnClick`
- Refactor inventory / +i / who / +glance onto helpers
- **score** web layout with quick actions (inventory, who,
  look me); telnet text card unchanged
- Docs: scripting guide Structured UI section

## 1.0.30

- Web register: first player on empty DB gets
  superuser/wizard/admin (portal-first boot)

## 1.0.29

- Reconnect: skip connect splash; short "Reconnected."
  when session.meta.reconnect / ?reconnect=true

## 1.0.28

- **inventory** / **inv** / **i** — telnet header/divider/footer;
  web play interactive item list (click → look).
- **+glance** — full layout chrome on telnet; web entity-list
  (name, idle, short-desc; click → look).
- **+i** / **+inv** — web inventory layout for another player's
  carried items (same rules as before).

## 1.0.27

- **ooc** — web play chat bubbles (`kind: ooc`, OOC badge);
  `echo: false`; telnet prefix line unchanged. Honors +chat.
- **who** — telnet uses `header` / `divider` / `footer` layout
  chrome; web play gets interactive entity-list layout.
  `@whoformat` still forces plain text for all clients.

## 1.0.17

- Web look UI honors `plugins.globals.theme.look`:
  `showShortDesc`, `showIdle`, `showExitAliases`, `aliasCase`,
  `exitColumns`, `descIndent`, `roleTags` (same as text look).

## 1.0.16

- **look** is UI-ready for web clients: `u.ui.layout` with
  header / text / entity-list / actions (Figma look composition).
  Exit and character rows carry `action.cmd` for FE click → send.
  Telnet unchanged (plain text look).

## 1.0.15

- Web WS sends **telnet ANSI** (not HTML). Core `wordWrap` was
  splitting HTML `style='…'` attrs into visible junk; ANSI is
  wrap-safe. Site /play converts ANSI → closed spans.
- HTML format builds closed color spans (`mushMessageToHtml`)
- `mushCodesToHtml` helper for monikers

## 1.0.14

- `u.ui.layout` sends WS `{ data: { ui } }` for the web game client

## 1.0.13

- `+finger` enforces 78-column lines (title, full-name row, fields);
  layout chrome split per line; join with `\n` like look

## 1.0.12

- Globals-style player/staff commands (SGP parity where missing):
  `+finger`, `+staff`, `+duty`, `+glance`, `+gname`, `+motd`,
  `+uptime`, `+i`/`+inv`, `+summon`/`+rsummon`/`+join`/`+rjoin`,
  `@exittype`, `+ooctag`
- In-game help files under `help/{social,info,staff,building}/`
- Soft-registers help dirs when `@ursamu/help` is installed
- `ooc` respects personal `+ooctag` when OOCFORMAT is unset

## 1.0.11

- HTTP login accepts legacy plaintext passwords (parity with telnet)
- Upgrades plaintext → bcrypt on successful login

## 1.0.10

- `/api/v1/me` adds `monikerHtml` (colored moniker as safe HTML, web-safe palette).
- `monikerToHtml` helper for %c / <#rrggbb> → spans.

# Changelog

## 1.0.20

- `@image <obj>=<url|clear>` stores local object images under `/images/`
- REST `POST|DELETE /api/v1/dbobj/:id/image` (file upload or URL import)
- look UI shows `/images/`, `/avatars/`, `/site/`, and http(s) media
- `@avatar` dual-writes shared `/images/` store

## 1.0.19

- Web session:open splash auto-detects HTML vs markdown layout

## [1.0.9] - 2026-08-03

### Fixed

- `registerPluginRoute` registry is process-wide (`globalThis`)
  so plugins that import `ursamu` / `@ursamu/mush` / a JSR pin
  share one map with `handleRequest` (fixes missing `/site`
  registration and theme hot-reload when graphs diverge).

## [1.0.8] - 2026-08-02

### Fixed

- `registerPluginRoute("/")` no longer collapses to `""` (which
  matched every path via `startsWith("/")` and broke public FE).
- Longest-prefix wins; root `/` is exact-match only.
- HTML GET `/` falls back to `/site/` when site is loaded, not
  always `/admin/`.

## [1.0.7] - 2026-08-02

### Fixed

- GET `/` tries plugin routes first (public FE `serveRoot`)
  before redirecting browsers to `/admin/`.

All notable changes to `@ursamu/mush` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.6] - 2026-07-31

### Fixed

- `/` HTML redirect also handles HEAD.

## [1.0.5] - 2026-07-31

### Changed

- Browser GET `/` redirects to `/admin/` (JSON clients unchanged).

## [1.0.4] - 2026-07-31

### Added

- Engine **`enter` / `leave`** verbs — any non-room/exit object.
  Default deny; `enter_ok`, `@lock/enter`, or owner/staff.
  Players stay private without `enter_ok`. Optional
  `&CAPACITY` / `&MAPCAPACITY`. Leave refused while container
  location is `map:…` (land first).
- Exports: `enterObject`, `leaveObject`, `canEnterObject`,
  `passesEnterLock` (for map-plugin embark aliases).
- Exit traversal refuses leaving a `map:…` holding for a
  destination outside that holding (parity with leave).
  Helper: `mapHoldingOf`.

## [1.0.1] - 2026-07-28

### Fixed

- `@restart` dual-package overrides cover full mush `0.1.x` /
  `0.2.x` when host is on `1.x` (plugins still pin `0.1.30`)

## [1.0.0] - 2026-07-28

First stable release of the MUSH world layer on `@ursamu/core@^1.0.0`.

### Added

- `docs/STABLE.md` - stable vs evolving export contract
- Softcode smoke matrix (math, string, list, logic, registers, `%0`)
- Speech verb tests (say / pose / think / page usage)
- Cmd middleware lifecycle test (order + remove by reference)
- README 1.0 stability tiers and version policy

### Changed

- Version **1.0.0** - breaking changes to stable APIs require a major bump
- Dual-package and softcode docs aligned to 1.0 host pins

### Security (inherited 0.1.x / 0.2.x)

- Avatar fetch SSRF guards
- Safer `@restart` (exact pins, lock purge, cache-before-reboot)

## [0.2.0] - 2026-07-28

Pre-1.0 milestone on a stable core floor.

### Added

- Depends on `@ursamu/core@^1.0.0`
- `docs/DUAL_PACKAGE.md` - single-instance import map guidance
- `docs/SOFTCODE.md` - evaluator support and non-goals
- README stability tiers (path to 1.0)
- CHANGELOG

### Fixed

- `@pcreate` unique-name test uses real dbojs (matches production)

## [0.1.30] - 2026-07-28

### Added

- `ooc` room speech with `OOCFORMAT`
- Safer `@restart` (exact pins, lock purge, cache-before-reboot)
- Soft-reboot reauth / connect announce fixes

## [0.1.0] - 2026

Initial JSR line for the extracted mush package (world layer on core).
