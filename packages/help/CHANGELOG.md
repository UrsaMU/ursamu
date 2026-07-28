# Changelog

All notable changes to `@ursamu/help` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
