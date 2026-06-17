# Changelog

All notable changes to `@ursamu/map-plugin` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).


## [3.0.0] - 2026-05-14

The platform release. Closes [#2](https://github.com/UrsaMU/ursamu-map-plugin/issues/2) — turns the plugin from "one infinite grid" into a host for many themed maps with movement, region metadata, REST, and pluggable extension points.

### Added

- **§1 Realm / map-id scoping.** Optional `realm: string` on `Coord` and `TileOverlay`. `coordKey` now produces `"realm:x,y,z"`. Two overlays at the same `(x,y,z)` in different realms coexist. Header shows `[Realm: <name>]` when non-default. Exports `DEFAULT_REALM`, `realmOf()`.
- **§2 Per-realm `MapConfig` registry.** `registerMapConfig(realmId, cfg)` / `unregisterMapConfig(realmId)` / `getMapConfig(realmId)`. `getTopologyEngine(realmId)` caches a `TopologyEngine` per realm. Siblings ship Star Wars / Shadowrun / D&D biome sets side-by-side.
- **§3 `moveCoord` + move-guard registry.** `moveCoord(u, playerId, from, deltaOrCoord, opts?)` resolves cost, honors `BiomeDefinition.traversal === "impassable"` and `overlay.blocksMovement`, runs registered guards, emits `map:player:moved` / `map:player:blocked`. `registerMoveGuard(fn)` / `unregisterMoveGuard(fn)` with first-veto-wins semantics. Direction constants `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`. `runMoveGuards(ctx)` exposed so the +move command also runs the guard chain.
- **§4 Pathfinding primitives.** `getTraversalCost(from, to, opts?)` and `findPath(from, to, opts?)` (A*). Honors overlays, `avoid(coord)` filter, `maxCost` / `maxIterations` caps, configurable diagonals.
- **§5 REST surface.** Bearer-authenticated routes under `/api/v1/map/`: `GET /realm/:id/render?center=x,y&radius=N`, `GET /player/:id`, `POST /overlay`, `DELETE /overlay`. 401-before-work on every route; overlay writes are admin-only. Render route output has parity with the in-game renderer.
- **§6 Render extension points.** `registerRenderLayer(name, fn)` paints additional tiles in registration order (later wins). `registerInfoLine(fn)` appends to a new "INTEL" section below "ADJACENT SECTORS". Each provider is sandboxed — a throw is logged and skipped.
- **§7 Nested region metadata.** `MapConfig.regions: Region[]` with `parent`, `tags`, free-form `metadata`. `getRegion(cfg, coord)` returns the deepest match; `getRegionPath` returns the deepest-to-outermost chain. Renderer header shows "City — Country — Continent". Legacy `MapConfig.sectors` auto-converts.
- **V3 migration helper.** `migrateToV3()` (and `migrateOverlayKeys` / `migrateFogKeys`) rewrites pre-v3 `"x,y,z"` DBO ids/keys into the new `"realm:x,y,z"` form. Idempotent.

### Changed

- **BREAKING:** `coordKey` format changed to `"realm:x,y,z"`. Existing data is still readable via `realmOf()` defaulting to `"default"`, but the stored `id` / `key` on TileOverlay and FogRecord rows is stale. Run `migrateToV3()` once after upgrade.
- `FogRecord` gained optional `realm`. Pre-v3 rows render under `"default"`.
- The `+map/jump` help reflects the optional `[realm]` token.
- `+move` now runs the move-guard chain before `moveEntity`, so siblings' registered guards veto entity moves with a reason.

### Notes

- Tests: 126 passed at v3.0.0 cut.
- Co-existing PRs that touched format.ts / index.ts were rebased serially; final merge order is preserved in git history.


## [2.1.1] - 2026-05-13

### Security

- **H1 — Cross-faction vision leak via DESCFORMAT (HIGH).** A non-admin
  link-mode viewer could `look` at any `MAP_CAPABLE` container and read
  the SUBJECT's faction-shared vision + memory, bypassing the intended
  admin-spectate-only path for "see through someone else's eyes." Fixed
  with a `canViewSubject(active, subject)` predicate in
  `commands_internals.ts`: render proceeds only if the viewer's active
  entity equals the subject, is a same-faction ally, or the viewer is
  in admin spectate mode. 6 exploit tests in `security.test.ts`.

- **M1 — Cron timer leak on double-init (MED).** If `init()` ran twice
  without an intervening `remove()` (engine reload, hot-reload, test
  fixture re-init), the first `setInterval` handle was orphaned and
  kept firing forever. `init()` now `clearInterval`s any existing
  timer before scheduling a new one.

### Known limitations (carried forward)

- **M2** TOCTOU on `+move` stacking: two concurrent moves into the same
  tile can both pass the canStackWith check. Acceptable for V1.
- **M3** `pruneStaleMemory` scans `fog.all()` per cycle; part of the
  chunk-key index roadmap.

## [2.1.0] - 2026-05-13

### Added

- **Faction-based stealth.** `MapEntity.hidden === true` makes an entity
  invisible to non-faction-mates. Faction-mates always see their own
  hidden entities. Implemented as a single `isEntityVisibleTo(target,
  viewer)` predicate in `schemas.ts`; consumed by `unionVisibleFor` in
  `fog.ts` (faction-shared vision union) and by the entity-marker filter
  in `format.ts` (rendered contacts list).
- **Stacking rules.** `+move` refuses to enter a tile occupied by a
  different-faction (or factionless) entity. Same-faction stacks freely.
  Admin `+map/jump` and `+map/launch` bypass the check. New pure
  predicate `canStackWith(mover, occupants)` in `commands_internals.ts`.
- **Automatic fog memory pruning.** `index.ts` schedules
  `pruneStaleMemory()` every 15 minutes during `init()` (plus one kick-off
  run); `remove()` clears the interval. Bounds the `map.fog` DBO growth
  without an external cron.
- New test files: `tests/stealth.test.ts` (6), `tests/stacking.test.ts`
  (8). Total suite: **65 passing** (was 51).

### Security

- Stealth filter applied at TWO layers (vision sharing + render filter)
  so hostile hidden entities cannot leak through either the FoV-union
  path or the contacts-section path.
- Audit findings H1, H2, M1, M2, M3 remediated in v2.0.1 (see
  preceding commit). Net: pilot authorization, entity-claim
  authorization, memory TTL, movement bounds, launch coord validation.

## [2.0.0] - 2026-05-13

### BREAKING

- Players no longer carry `state.coord`. Map presence requires a `MapEntity` and either containment in a `MAP_CAPABLE` object or a `state.mapControlling` link.
- DESCFORMAT handler no longer triggers for arbitrary objects with `state.coord`. It triggers only when the target is a `MapEntity.containerId` and the viewer has a resolvable active entity (or is an admin spectator).
- `+map/jump` is now admin-only and operates on the caller's active entity, not the caller themselves.

### Added

- `MapEntity` model + `map.entities` DBO collection.
- `+map/embark`, `+map/disembark`, `+map/launch`, `+map/land`, `+map/link`, `+map/unlink`, `+map/spectate`, `+map/unspectate`, `+map/stats` commands.
- `+move` command (n/s/e/w/u/d/diagonals) that walks the caller's active entity.
- Fog of war: live vision (Chebyshev), faction-shared union, explored memory (`map.fog` DBO), terrain occlusion (`BiomeDefinition.occludes`, `TileOverlay.occludes`).
- `MAP_CAPABLE` object flag as the primary "passenger" gate.
- `MapConfig.bounds` (optional hard XYZ bounds).
- `TileOverlay.blocksMovement` for impassable authored tiles.

### Security

- New validateEntity invariants mirror validateOverlay (coord range, glyph length, no `[`/`]` in text, name/kind length caps, vision ≤ MAX_VISION).
- `+map/jump`, `+map/spectate`, `+map/stats` gated by admin/wizard/superuser flag check inside exec (per catch-all switch pattern).
- Off-map players see a hard-cordon error message ("You have no map presence"); admin spectate is the only override.

## [1.1.0] - 2026-05-13

### Changed

- **Drop `npm:simplex-noise` and `npm:alea` dependencies.** Topology engine now uses `createNoise(seed)` from `ursamu` (added in 2.5.2), which exposes a per-instance `Noise` class with its own permutation table. String seeds are hashed FNV-1a to a 32-bit int before passing to `createNoise`. Snapshot fixture re-bootstrapped — terrain output is deterministic but differs numerically from the previous Alea-seeded build.
- **Engine requirement bumped to `>=2.5.2`.** The plugin now has **zero npm dependencies** at the import-map level.

## [1.0.0] - 2026-05-13

### Added

- Initial plugin scaffold registered as `@ursamu/map-plugin` (UrsaMU `>=2.3.0`).
- Procedural topology engine backed by Simplex noise + Alea PRNG (`topology.ts`).
- Sparse DBO overlay store in the `map.overlays` collection with `getOverlay`, `getOverlaysInRegion`, `setOverlay`, `clearOverlay` (`state.ts`).
- Split-pane Latin-1 renderer using the engine's native `header` / `divider` / `footer` helpers (`renderer.ts`).
- DESCFORMAT integration: `descFormatHandler` registered via `registerFormatHandler` on `init()` and unregistered cleanly on `remove()`.
- `+map` command suite with `/here`, `/look`, and builder-gated `/jump` (`commands.ts`).
- Default 7-biome Whittaker config in `config.default.ts` plus configurable sector AABBs.
- 11/11 passing tests across the security and showcase suites.

### Security

- `safeText` escapes `[` and `]` in DESCFORMAT output to prevent MUSH-eval injection.
- `parseCoord` accepts integers only and rejects values outside +/- 1,000,000.
- `validateOverlay` enforces coord range, single-character glyph, 80-char name/faction/kind/biome cap, 2048-char desc cap, and bracket-free text fields.
- `getOverlaysInRegion` caps requested region span at `REGION_MAX_TILES = 4096` before scanning.

### Known limitations

- `entitiesInRegion` in `format.ts` is a stub — connected players and NPCs are not yet projected onto the viewport.
- No chunk-key index on overlays; `getOverlaysInRegion` performs `overlays.all()` then filters in memory.
- No REST routes shipped; consumers must register their own via `registerPluginRoute`.
- No config-injection plumbing — `defaultMapConfig` is imported directly by `format.ts`; swapping config requires a fork or patch.
- No in-game overlay-authoring command; overlays must be written programmatically via `setOverlay`.

[1.0.0]: https://jsr.io/@ursamu/map-plugin
