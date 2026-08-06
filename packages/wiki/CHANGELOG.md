# Changelog

## [0.2.9] - 2026-08-06

### Fixed

- Edits no longer overwrite the original page `author`. PATCH and
  in-game `@wiki/edit` (and tag/lock/draft) keep the creator and
  refresh `date` as the last-edit stamp only.

## [0.2.8] - 2026-08-03

### Notes

- Release line for media/featured work (see 0.2.4–0.2.7).

## [0.2.7] - 2026-08-03

### Changed

- Short markdown image refs: `![crest](crest.png)` resolves to
  the page’s `_assets/` at render time. Insert no longer writes
  the long `/api/v1/wiki/…` URL. Full URLs still work.

## [0.2.6] - 2026-08-03

### Added

- Per-page **images** on server (no hotlink required):
  - Files: `wiki/<page>/_assets/<name.ext>`
  - Public URL: `/api/v1/wiki/<page>/_assets/<name>`
  - `GET/POST /api/v1/wiki/<page>/media` — list; upload
    (multipart `file`) or import `{ "url": "https://..." }`
  - `DELETE /api/v1/wiki/<page>/media/<name>`
  - SSRF-safe URL import (same guards as `@wiki/fetch`)
- SVG served for embedding (PDF still attachment)

## [0.2.5] - 2026-08-03

### Added

- Page frontmatter `bgImage` (boolean, default false). List and GET
  expose it; PATCH/POST store it. Public site uses home-height layout
  when true; compact (no title height) when false. Home page chrome
  still follows site `plainBg` settings, not this flag.

## [0.2.4] - 2026-08-03

### Fixed

- List endpoint includes `featured` so public FE / staff can filter
  featured pages (sidebar + home).

## [0.2.3]

### Notes

- Prior pin on court.

## [0.2.2] - 2026-07-30

### Added

- Staff console nav is **plugin-owned**: soft-registers
  `route: "wiki"` on `@ursamu/web` (in-console `/admin/wiki`)
- Live `wiki:drafts` badge via staff badge bridge + lifecycle hooks
- Package identity constants in `version.ts`


## [0.2.1] - 2026-07-30

### Added

- First JSR release — file-based markdown wiki + REST API
