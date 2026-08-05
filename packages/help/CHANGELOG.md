# Changelog

All notable changes to `@ursamu/help` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.2.0] - 2026-08-04

### Security

- Staff-only help is gated for non-staff viewers:
  admin/staff sections, `staff/` paths, dark/`_hidden`
  files, and commands with admin/wizard/builder locks
- Public `GET /api/v1/help` omits those topics
- Direct `GET /api/v1/help/:topic` returns 404 (not 403)
  so existence is not leaked
- Staff (admin/wizard/superuser/staff flags) still see all

## [1.1.0] - 2026-08-04

### Added

- Staff console nav bridge (`route: "help"`)
- Staff index includes hidden/dark topics when authenticated
- Package identity in `version.ts`

### Fixed

- `isAdmin` handles Set / array / string flag shapes

## [1.0.1] - 2026-07-30

### Fixed

- FileProvider prefixes nested plugin help topics with the
  `registerHelpDir` section id (e.g. `staff/…` → `bbs/staff/…`)
  so documented paths like `+help bbs/staff` resolve, and bare
  names like `staff` no longer collide across plugins


## [1.0.0] - 2026-07-28

First stable release of the API-first help system.

### Added

- `docs/STABLE.md` — stable vs evolving export contract
- CHANGELOG included in publish
- README 1.0 stability tiers and version policy

### Changed

- Version **1.0.0** — breaking changes require a major bump
- Depends on `@ursamu/mush@^1.0.0`
- Plugin `version` aligned with package version

### Security (inherited 0.1.x)

- Symlink / path traversal guards in file provider
- Admin REST uses simple id queries (no `$where` closures)
- `+help/set` strips MUSH codes before store

## [0.1.9] - 2026-07

### Added

- Layout chrome via `game.layout` / TinyMUX fallback
- `registerHelpDir` for plugin help trees
- Command, file, and DB providers
- REST `/api/v1/help`
