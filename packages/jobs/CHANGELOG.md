# Changelog

## [1.1.2] - 2026-07-30

### Added

- Staff console nav is **plugin-owned**: soft-registers
  `route: "jobs"` on `@ursamu/web` (in-console `/admin/jobs`)
- Live `jobs:open` badge via staff badge bridge + lifecycle hooks

### Changed

- Package identity constants in `version.ts` (title, id, version)


## [1.1.1] - 2026-07-29

### Fixed

- Typecheck: AST narrowing in `select.ts` / `select-parse.ts`
  (`deno check` green)
- REST visibility helpers extracted and unit-tested
  (staff flag Set/array/string; no substring admin bypass;
  staffOnly comments stripped for players)

### Docs

- STABLE.md quality bar + exported REST auth helpers

## [1.1.0] - 2026-07-28

Advanced surface on top of 1.0 workflow.

### Added

- `+jobs/select` boolean DSL (`and`/`or`/`not`, criteria, `sort=`)
- Saved selects: `default`, `save`, `list` (state.jobs)
- `+jobs/reports` — open, overdue, assignees, aging, actby
- `+jobs/compress`, `+jobs/clean` (wizard)
- `+jobs/summary <bucket>`
- `+jgroup` CRUD (named player lists)
- `plugins.jobs.letters` mail templates on approve/deny/complete
- `+job/publish`, `+job/act`; comment [n+]/[n-] markers
- `registerJobActionHook` (CRE/ADD/COM/APR/DNY/DEL)
- `IJob.summary`, `IJobComment.action`
- Tests: select, reports, letters

### Docs

- FEATURES.md / STABLE.md updated for 1.1

## [1.0.0] - 2026-07-28

Daily workflow: lists, lifecycle, presets, prefs.
