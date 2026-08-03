# Changelog

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
