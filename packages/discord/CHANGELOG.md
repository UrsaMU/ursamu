# Changelog

All notable changes to `@ursamu/discord` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-07-28

First stable release of the Discord bridge.

### Added

- `docs/STABLE.md` — stable vs evolving export contract
- CHANGELOG included in publish
- README 1.0 stability tiers and version policy

### Changed

- Version **1.0.0** — breaking changes require a major bump
- Depends on `@ursamu/mush@^1.0.0`, `@ursamu/core@^1.0.0`,
  `@ursamu/help@^1.0.0`, `@ursamu/channels@^1.0.0`
- Plugin dependency `help` >= 1.0.0

### Security (inherited 0.2.x)

- Ed25519 interaction signature verification
- Loop prevention (ignore bot/webhook posts; `source: discord`)

## [0.2.4] - 2026-07

### Added

- Webhooks game → Discord
- Gateway Discord → game channel inject
- `/help` slash + interactions route
- Job / presence / scene hooks
