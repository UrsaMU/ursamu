# Changelog

## [1.0.0] - 2026-07-28

Anomaly Jobs **workflow** standards on mush/help 1.x.

### Added

- List filters: +jobs/all, mine, new, overdue, from, who,
  list, pri, due, date, sort, search, catchup, silence,
  nospam, credits
- Lifecycle: +job/add, create, complete, approve, deny,
  due, status, esc, hold, tag, access, delete
- Player shortcuts: +bug, +typo, +pitch; +myjobs/nospam
- Job fields: dueAt, esc, progress, tags, published
- docs/ANOMALY.md, docs/STABLE.md
- Depends on mush/help ^1.0, mail ^2.5

### Notes

- Full +jobs/select DSL, jgroups, form letters, reports
  deferred to 1.1+ (see ANOMALY.md)

## [0.1.1] - 2026

Initial Anomaly-style jobs/request line.
