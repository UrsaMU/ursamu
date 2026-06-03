---
layout: layout.vto
description: Contribute to UrsaMU — pre-commit gauntlet, repo layout, and the contributor workflow for v2.6.0.
---

# UrsaMU Development

This section covers how to contribute to UrsaMU — fixing bugs, adding commands,
shipping plugins, or improving the docs. UrsaMU is v2.6.0; the test suite is
1464 passing across 480 lint-clean files.

## Pre-Commit Gauntlet

Every commit must pass these four steps in order — they mirror the CI workflow
in `.github/workflows/ci.yml`:

```bash
deno check --unstable-kv mod.ts                                       # type check
deno lint                                                              # lint
deno test tests/ --allow-all --unstable-kv --no-check                  # unit tests
deno test tests/security_*.test.ts --allow-all --unstable-kv --no-check # security
```

If any step fails, the commit is not ready. CI will reject it.

## Day-to-Day Commands

```bash
deno task test          # full suite — must stay green
deno task test:coverage # LCOV at coverage/lcov.info
deno task start         # run the hub + telnet sidecar
deno task dev           # dev mode with auto-restart
deno lint               # must be clean across all 480 files
```

## Repo Layout

```
packages/
  core/              @ursamu/core — transport, DB, plugin loader, event bus
  mush/              @ursamu/mush — MUSH world layer (IDBObj, flags, locks, softcode, addCmd)
src/
  @types/            TypeScript interfaces (IDBObj, IUrsamuSDK, ICmd, IPlugin, …)
  commands/          Native addCmd registrations (Deno context, full APIs)
  plugins/<name>/    Bundled plugins — index.ts + commands.ts + help/ + README.md
  routes/            Express REST routers (auth, dbObj, scenes, players, config)
  services/          Core engine (Database, Sandbox, GameClock, Hooks, JWT, …)
  utils/             Shared helpers (flags, target, locks, formatHandlers, …)
system/
  scripts/           Sandbox scripts — one file per command (no Deno APIs)
  help/              In-game help text
tests/               Deno test files — always place new tests here
docs/                Lume static site
config/              Runtime configuration (config.json, text/)
```

## Packages

The engine is organized as a monorepo with two published packages:

- **`@ursamu/core`** (`packages/core/`) — generic server infrastructure: transport
  abstraction, Deno KV database layer, plugin lifecycle, and the event bus. Has no
  MUSH-specific concepts and can be reused for other game types.
- **`@ursamu/mush`** (`packages/mush/`) — the MUSH world layer built on top of core:
  `IDBObj`, flag system, lock evaluation, TinyMUX softcode engine, `addCmd`, and the
  full `IUrsamuSDK`. This is what plugins and game scripts import.
- **`@ursamu/ursamu`** — a backwards-compat shim that re-exports everything from
  `@ursamu/mush`. Existing plugins importing `jsr:@ursamu/mush` continue to work.
  New projects should prefer `jsr:@ursamu/mush`.

Package tests live alongside their source:

```
packages/core/tests/      core infrastructure tests (including security/)
packages/mush/tests/      MUSH engine tests
```

## Where Changes Go

| Adding | Location |
|--------|----------|
| A new core command | `src/commands/<name>.ts`, registered via `addCmd` |
| A plugin command | `src/plugins/<plugin>/commands.ts`, imported by `index.ts` |
| A REST endpoint | `src/routes/` (core) or `registerPluginRoute` (plugin) |
| A sandbox script | `system/scripts/<name>.ts`, ESM `export default` |
| A new hook event | Extend `GameHookMap` via declaration merging |
| A custom lockfunc | `registerLockFunc(name, fn)` in plugin `init()` |
| A format slot | `registerFormatHandler` (TS) or `registerFormatTemplate` (softcode) |

## Sub-Pages

- [Testing](./testing.md) — mock SDK, sandbox stubs, DB cleanup, CI integration
- [Contributing](./contributing.md) — branching, PRs, commit conventions

## Reference

- Authoritative API surface: `src/@types/UrsamuSDK.ts` and
  [`docs/llms.md`](../llms.md)
- Project conventions: `CLAUDE.md` at the repo root
