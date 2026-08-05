# Changelog

## [2.7.0] - 2026-08-04

### Added

- `GET /api/v1/mail/stats` — system totals (staff)
- `GET /api/v1/mail/all` — system-wide browser (staff)
- Staff may open / trash any message
- Staff nav bridge (`route: "mail"`) for `@ursamu/web`

## [2.5.0] - 2026-07-28

Stable freeze on the UrsaMU **1.x engine floor**.

### Added

- `docs/STABLE.md` — stable exports, commands, REST, policy
- CHANGELOG included in publish
- README stability section for 2.5

### Changed

- Depends on `@ursamu/mush@^1.0.0`, `@ursamu/core@^1.0.0`,
  `@ursamu/help@^1.0.0`
- Plugin version aligned with package **2.5.0**

### Notes

- Package was already **2.4.0** on JSR; this is not a new 1.0 line.
  Breaking API changes still require **3.0.0**.

## [2.4.0] - 2026

Drafts, folders, attachments, quota, expiry, REST, help dep.
