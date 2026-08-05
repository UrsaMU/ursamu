# Stable API contract (help 1.0)

Breaking changes to **stable** exports require a **major** bump.
**Internal** pieces may change in minor releases.

## Stable (semver-covered)

**Plugin**
  `plugin` (default export) — `init` / `remove` lifecycle

**Registration**
  `registerHelpDir(pathOrUrl, section?)`
  `bustCache()`
  `registerHelpEntry(entry)`
  `slugify(name)`

**Registry**
  `helpRegistry` — `lookup`, `all`, `sections`, `inSection`,
  `addProvider`, `removeProvider`
  Types: `HelpEntry`, `HelpProvider`, `HelpSource`

**DB helpers**
  `upsertEntry`, `deleteEntry`, `IHelpDbEntry`

**Providers (constructable)**
  `CommandProvider`, `FileProvider`, `DbProvider`

## Commands (in-game)

| Command | Lock | Role |
|---------|------|------|
| `help` / `help <topic>` | connected | Index / topic |
| `help/section <name>` | connected | Section list |
| `+help/set` | admin+ | DB create/update |
| `+help/del` | admin+ | DB delete |
| `+help/reload` | admin+ | Bust file cache |

## REST (stable paths)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/help` | none |
| GET | `/api/v1/help/:topic` | none |
| GET | `/api/v1/help/:topic?format=md` | none |
| POST | `/api/v1/help/:topic` | admin JWT |
| DELETE | `/api/v1/help/:topic` | admin JWT |

## Evolving

- Exact markdown → terminal color mapping
- File-provider scan heuristics (dark: frontmatter, `_` hide)
- REST response field extras beyond name/section/content/tags

## Dependencies

- `@ursamu/mush@^1.0.0` (layout chrome + `addCmd` / `gameHooks`)

## Version policy

| Change | Bump |
|--------|------|
| Remove/rename stable export or REST path | major |
| New provider hook, additive REST field | minor |
| Bugfix, docs, tests | patch |

## File help conventions

See monorepo Claude.md help standards: 78-col, ≤22 lines per
page, `SEE ALSO`, subdirectory sections, subtle markdown.
