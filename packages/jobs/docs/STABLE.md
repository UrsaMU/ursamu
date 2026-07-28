# Stable API contract (jobs 1.1)

Breaking changes to **stable** exports require a **major** bump.

jobs system **workflow** parity — see `docs/FEATURES.md`.

## Stable exports

| Export | Role |
|--------|------|
| default plugin | `init` / `remove` |
| `registerJobBuckets` | Extend bucket names |
| `jobHooks` | Lifecycle events |
| `registerJobActionHook` | CRE/ADD/… aliases |
| `runSelect` | Select DSL evaluator |
| `jobGroups`, `expandJobGroup` | jgroups |
| `jobs`, `jobArchive`, `jobAccess` | DBO collections |
| Types `IJob`, `IJobComment`, `IJobAccess` | Domain model |

## Commands (1.0)

**Players:** `+request`, `+requests`, `+myjobs`[/nospam],
`+bug`, `+typo`, `+pitch`

**Staff lists:** `+jobs`[/all|mine|new|overdue|from|who|list|
pri|due|date|sort|search|catchup|silence|nospam|credits]

**Staff job:** `+job`[/comment|add|assign|close|complete|
approve|deny|create|due|status|esc|hold|tag|access|delete|
addplayer|bucket|addaccess|removeaccess|listaccess|renumber]

**Archive:** `+archive`[/read|purge|…]

## REST

`/api/v1/jobs` — auth required (existing router).

## Dependencies

- `@ursamu/mush@^1.0.0`, `@ursamu/help@^1.0.0`
- `@ursamu/mail@^2.5.0` (optional soft for notifications)

## Version policy

| Change | Bump |
|--------|------|
| Remove command or stable export | major |
| New filter / switch, additive fields | minor |
| Bugfix, docs | patch |
