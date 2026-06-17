# Security

## Threat model

This plugin runs inside a trusted UrsaMU server process. The threats in scope are: (a) authenticated players abusing input parsing on `+map` and its switches, (b) builders authoring malicious overlay content that lands in the overlay store, and (c) DESCFORMAT output being re-evaluated by the MUSH softcode engine when a `look` re-resolves the rendered description. Out of scope: network-layer attacks, authentication and session integrity (the engine's job), and database-level encryption.

## The four invariants

### I1. `safeText()` escapes `[` and `]` in user-derived strings

- **What it protects:** DESCFORMAT output that flows through the softcode evaluator cannot trigger function calls embedded in user-supplied text.
- **Where it lives:** `renderer.ts:16-17`
- **Test that locks it:** `H1: overlay name with [...] is escaped, not passed raw` (`tests/security.test.ts`)
- **How to break it:** Without `safeText`, an overlay named `[shutdown()]` would render as literal `[shutdown()]`; when a player runs `look`, the MUSH engine re-evaluates the description and invokes `shutdown()` as a softcode call. `safeText` also pipes through `stripColor` so `%c`-prefixed ANSI codes in user input cannot poison surrounding markup.

### I2. `parseCoord()` accepts integers only, magnitude <= 1,000,000

- **What it protects:** Protects against (a) precision-dead Simplex noise sampling at extreme floats and (b) overlay equality lookups breaking when keys derived from `coordKey` no longer round-trip.
- **Where it lives:** `commands_internals.ts:8-22` (`COORD_MAX = 1_000_000`)
- **Test that locks it:** `M2: parseCoord rejects non-integers and out-of-range` (`tests/security.test.ts`)
- **How to break it:** `+map/jump 1e20 0 0` would seed noise sampling at a coord where IEEE-754 spacing exceeds 1, producing identical biomes for every neighbour and breaking overlay key matching.

### I3. `validateOverlay()` enforces coord range, glyph length, no `[`/`]`, length caps

- **What it protects:** Every stored overlay record; closes the persistence-layer bypass that would otherwise route around `safeText` on read.
- **Where it lives:** `state.ts:84-104`; called from `setOverlay()` at `state.ts:52-59` (throws `"setOverlay: invalid overlay payload"`).
- **Test that locks it:** `L3: validateOverlay rejects bad payloads` (`tests/security.test.ts`)
- **How to break it:** Writing an overlay with `glyph: "ab"` would corrupt the fixed-width minimap grid; writing `name: "[bad()]"` would defeat I1 on a renderer path that ever forgot to call `safeText` on a single field.

### I4. `getOverlaysInRegion()` caps span at `REGION_MAX_TILES = 4096`

- **What it protects:** Per-look DoS via giant bounding-box scans. The current implementation calls `overlays.all()` and filters in memory; the cap bounds total work even if the underlying store grows.
- **Where it lives:** `state.ts:25-48` (`REGION_MAX_TILES` at `state.ts:50`); throws `"getOverlaysInRegion: region too large"`.
- **Test that locks it:** Bound is constant; integration callers must stay within the viewport. (Add explicit regression test when authoring tooling lands.)
- **How to break it:** A future caller passing `min = -1e6, max = 1e6` would otherwise force a full-table scan plus an arithmetic span of 8e18.

## Lock levels

| Command       | `lock:` string | Engine resolution                | Flag check inside `exec`             |
| ------------- | -------------- | -------------------------------- | ------------------------------------ |
| `+map`        | `"connected"`  | Any connected player passes      | None                                 |
| `+map/here`   | `"connected"`  | Inherited from parent            | None                                 |
| `+map/jump`   | `"connected"`  | Inherited from parent            | `isBuilder(u)` (builder/admin/wizard/superuser) |

`+map/jump` does **not** use `lock: "connected builder+"` because of the catch-all switch pattern: a single `addCmd` registration handles the bare `+map`, `/here`, and `/jump` cases. Raising the lock to `builder+` would lock non-builders out of the bare `+map` entirely. The lock therefore stays at `connected`, and the per-switch flag check lives inside `exec` (`commands.ts:22-27`, `commands.ts:64-68`), emitting `"Permission denied — +map/jump requires builder+."` on failure.

## What is NOT yet protected

- `setOverlay()` has no ownership check; any caller with a reference to it can author at any coord. There is currently no in-game command path that reaches `setOverlay` (the builder content workflow is pending), so the risk is dormant. When a `+map/authorize`-style command lands it MUST gate by `canEdit(u.me, target)` or an explicit admin flag check before forwarding to `setOverlay`.
- `entitiesInRegion()` returns `[]` today; there is no entity scanning yet, so there is no entity-presence leak risk. When entity surfacing is implemented it will need visibility checks (dark flag, hidden NPCs, faction reveal rules) before the markers reach `buildContacts()`.

## Reporting

File an issue with reproduction steps and the literal payload that triggers the bug. Prefix the title with `security:` and avoid posting working exploits against production servers. A maintainer will triage within the normal issue cadence; patches that include a failing test in `tests/security.test.ts` are preferred.
