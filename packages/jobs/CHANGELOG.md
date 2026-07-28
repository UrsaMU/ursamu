# Changelog

## [1.1.0] - 2026-07-28

Anomaly advanced surface on top of 1.0 workflow.

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

- ANOMALY.md / STABLE.md updated for 1.1

## [1.0.0] - 2026-07-28

Anomaly daily workflow: lists, lifecycle, presets, prefs.
