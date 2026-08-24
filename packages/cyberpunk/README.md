# @ursamu/cyberpunk-plugin

Cyberpunk RED (CPR) system plugin for [UrsaMU](https://github.com/UrsaMU/ursamu).

Chargen, character sheets, Friday Night Firefight combat (with
`@ursamu/combat` ports), cyberware, netrunning, Night Markets,
gigs, roles, and improvement — wired for monorepo packages
(`help`, `combat`, `vendor`, `jobs`).

## Install

### Monorepo / workspace

```jsonc
// game plugins.manifest or config
{ "name": "cpr", "path": "./packages/cyberpunk" }
```

Root workspace already includes `packages/cyberpunk`.

Local house game: `games/cpr` (loads CPR + peers).
```bash
cd games/cpr && deno task start
```

### Dependencies

| Peer | Purpose |
|------|---------|
| `@ursamu/help` | In-game help tree (`+help cpr`) |
| `@ursamu/combat` | Encounter store + AI walker ports |
| `@ursamu/vendor` | Shop EB spend/refund hooks |
| `@ursamu/jobs` | Staff `CGEN` / `SHEET` buckets |

## Docs

| Guide | Contents |
|-------|----------|
| [FIRST-HOUR.md](./FIRST-HOUR.md) | Player first session |
| [docs/getting-started.md](./docs/getting-started.md) | Install / peers |
| [docs/commands.md](./docs/commands.md) | Full command catalog |
| [docs/dev/](./docs/dev/) | Hooks, storage, rules (not in-game) |
| `help/` | In-game `+help` topics (section `cpr`) |

## First hour

See [FIRST-HOUR.md](./FIRST-HOUR.md).

```
+chargen          start an edgerunner
+sheet            full character sheet
+init / +attack   combat
+market           Night Market
+gig/list         job board (IC gigs — not staff +jobs)
+eb               eurodollars
```

Staff: `+cpr/info <player>`, `+cpr/heal <player>`.

## REST

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/cpr/meta` | public |
| GET | `/api/v1/cpr` | yes |
| GET | `/api/v1/cpr/sheet` | yes |
| GET | `/api/v1/cpr/chargen` | yes |
| POST | `/api/v1/cpr/chargen/start` | yes |
| POST | `/api/v1/cpr/chargen/submit` | yes |
| POST | `/api/v1/cpr/approve` | staff |

## Architecture

- Player state: `state.cpr` (`ICPRCharacter`)
- DBO namespaces: `cpr.*` (markets, gigs, netruns, …)
- Combat encounters: `cpr.encounters` via `@ursamu/combat`
- Legacy room tracker: `cpr.combat` (player `+init` / `+attack`)
- IC gigs: `+gig` / `cpr.jobs` — separate from staff `@ursamu/jobs`

## Develop

```bash
cd packages/cyberpunk
deno task test
deno task check
deno task showcase --list
```

## Rulebook

Mechanics tables live under `data/`. Full text for reference only:

- `books/cpr.txt`
- `resources/cyberpunk-red-core.txt` (+ errata)

Rulebook text is **not** published to JSR.

## Deferred (post-1.0)

Vehicles / chase combat, Trauma Team automation, full contacts
faction layer, tarot scene tools.

## License

MIT — see [LICENSE](./LICENSE). Cyberpunk RED is © R. Talsorian
Games / CD Projekt. This plugin is an independent fan implementation
of mechanics for private MUSH use; it does not redistribute the
rulebook.
