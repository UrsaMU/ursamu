# Changelog

All notable changes to `@ursamu/channels` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.2.4] - 2026-08-09

### Changed

- Monorepo source synced with court/JSR web hub (1.2.0–1.2.3):
  channel chat bubbles, dense `/play` hub, colored badges
- Dual room join (name + id) for Discord inject delivery
- Staff REST list returns `{ items, channels }`; history via
  `/messages` as well as `/history`

## [1.2.3] - 2026-08-07

### Fixed

- Channel badge keeps MUSH color codes (no uppercase/truncate)
  so web clients can render colored headers

## [1.2.2] - 2026-08-07

### Added

- Web channel speech uses chat bubbles (like say/pose/OOC)
  with channel badge, avatar, and pose/say modes

## [1.2.1] - 2026-08-07

### Changed

- Dense `/play` hub (mail/jobs grid): alias | on/off | channel |
  title·online; available | count | flags | join as
- Compact alias tools (mute/who/leave with alias badge)
- Web who UI (`alias who`, `allcom who`, `@cwho`) and history
  panels (`@chanhistory` / `@chantranscript`)
- Hub refresh after clearcom / comtitle

## [1.2.0] - 2026-08-05

### Added

- Interactive `/play` hub for `@channel`, `clist`, `comlist`
- Click-to-join, speak fill, mute, leave

## [1.1.0] - 2026-08-04

### Added

- Staff REST `/api/v1/channels` (list, create, get, patch, delete,
  history, who)
- Staff nav bridge (`route: "channels"`) for `@ursamu/web`
- `autoJoin` on channel records

## [1.0.1] - 2026-07-28

### Changed

- Depend on `@ursamu/mush@^1.0.0` and `@ursamu/core@^1.0.0`
  so hosts load a single engine instance with mush 1.x

## [1.0.0] - 2026-07-28

First stable release. MUX-style player aliases and staff admin for
UrsaMU. Not a full TinyMUX 2.12 comsys port (see README non-goals).

### Added

- Player commands: `addcom`, `delcom`, `clearcom`, `comlist`,
  `allcom`, `comtitle`, alias speech / pose / on / off / who
- Staff commands: `@chancreate`, `@chandestroy`, `@chanset`,
  `@cemit`, `@cboot`, `@cwho`, `@chanhistory`, `@chantranscript`
- `@clist` / `@clist/full` / `@clist/headers` (full = name, flags,
  owner, connected users only)
- Config-seeded default channels and `announce` presence lines
  (in-game only, not Discord)
- `channel:message` events for bridges; help under `+help channels`,
  `+help player`, `+help staff`
- Unit tests for aliases, clist visibility, admin gates, chanset
  parsing, and announce helpers
- Documented public API and non-goals in README

### Changed

- Help rewritten to project standard (player/ and staff/ sections)
- `@clist/full` no longer prints placeholder Obj / Charge / Balance
  / Messages columns (no channel economy)
- Plugin and package version aligned at 1.0.0

### Notes

- At 1.0.0 required mush >= 0.1.30 / core >= 0.1.6; see 1.0.1
  for mush/core ^1.0.0
- Tests: 29 passed at 1.0.0 cut

## [0.2.1] - 2026-07-28

### Changed

- `@clist/full` columns reduced to real fields only

## [0.2.0] - 2026-07-28

### Added

- Command unit tests and README 1.0 contract draft
- Help tree rewrite (player + staff)

## [0.1.x] - 2026-07

### Added

- Initial JSR releases: aliases, middleware speech, admin tools,
  history, announce, Discord-safe presence
