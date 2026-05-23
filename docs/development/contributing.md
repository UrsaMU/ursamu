---
layout: layout.vto
description: How to contribute to UrsaMU — branching, PRs, commits, and the pre-commit gauntlet.
---

# Contributing to UrsaMU

Thanks for your interest in contributing to UrsaMU. This page captures the
ground rules for v2.6.0.

## Prerequisites

- [Deno](https://deno.land/) 1.45+ (for `--unstable-kv`)
- [Git](https://git-scm.com/)
- An editor with the Deno extension (VS Code recommended)

## Initial Setup

```bash
git clone https://github.com/lcanady/ursamu.git
cd ursamu
deno task test   # confirm clean baseline
```

If you plan to send PRs, fork on GitHub and add your fork as `origin`,
keeping `upstream` pointed at `lcanady/ursamu`.

## Branching

Always work on a topic branch off `main`:

```bash
git fetch upstream
git checkout -b feature/short-description upstream/main
```

There is no long-lived `develop` branch — `main` is the release line.

## Pre-Commit Gauntlet

Run these four steps in order before every commit. They mirror CI:

```bash
deno check --unstable-kv mod.ts
deno lint
deno test tests/ --allow-all --unstable-kv --no-check
deno test tests/security_*.test.ts --allow-all --unstable-kv --no-check
```

A commit isn't ready until all four pass.

## Docs Stay in Sync

If you touch a public API, command, config key, script, scaffold output, or
plugin surface — update `README.md` and the relevant page under `docs/` in the
same commit. Stale docs ship as broken docs.

## Commits

- Write descriptive, present-tense subject lines: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- One logical change per commit.
- **No AI/Claude attribution.** Do not add `Co-Authored-By: Claude …`, do not
  reference AI tools in commit messages, PR descriptions, or code comments.
- Never amend a commit that failed a pre-commit hook — fix and create a new
  commit instead.

## Pull Requests

1. Push your branch to your fork.
2. Open a PR against `lcanady/ursamu:main`.
3. Keep PRs scoped — one feature or fix per PR.
4. Fill in the description: what changed, why, and how it was tested.
5. Make sure CI is green.

PRs are **squash-merged**. After merge, maintainers tag the release:

```bash
git tag v<version>
git push --tags
```

No AI attribution in PR titles or bodies either.

## Coding Standards

- TypeScript only. Follow the
  [Deno style guide](https://docs.deno.com/runtime/contributing/style_guide/).
- Early return over nested conditionals.
- No function longer than ~50 lines; no file longer than ~200 lines — decompose.
- `catch (e: unknown)` — never bare `catch`.
- Library-first: if the SDK does it, use the SDK.
- No comments unless the *why* is non-obvious (hidden invariant, bug workaround).

## Testing

- All new commands need tests in `tests/`.
- See [Testing](./testing.md) for `mockPlayer` / `mockU` helpers and DB
  cleanup conventions.

## Plugin Audit Checklist

Mental pass before opening a PR that touches plugins or core commands:

- `u.util.stripSubs()` on user strings before DB ops or length checks
- `await u.canEdit(u.me, target)` before modifying any object not owned by `u.me`
- DB writes use `"$set"` / `"$inc"` / `"$unset"` / `"$push"` — never raw overwrite
- `u.util.target()` result null-checked
- Admin-only paths gate on `u.me.flags` explicitly
- `system/scripts/` files use no Deno APIs, no `fetch`, no non-`u` globals
- All `%c*` color codes closed with `%cn`
- `gameHooks.on()` in `init()` paired with `gameHooks.off()` in `remove()` (same named ref)
- DBO collection names prefixed with `<pluginName>.`
- REST handlers return 401 before any work when `userId` is null
- `init()` returns `true`

## Getting Help

- File an issue on GitHub
- Join the Discord linked from the project README
- Reach out to maintainers in the PR thread
