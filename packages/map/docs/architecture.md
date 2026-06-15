# @ursamu/map-plugin — Architecture

A deep dive for developers reading the source for the first time. Each section
points at concrete identifiers and `file.ts:NN` anchors so you can follow along.

## 1. Module map

| File | Purpose | Key exports |
| --- | --- | --- |
| `schemas.ts` | Canonical type and constant contract; imports nothing from peers. | `Coord`, `coordKey`, `BiomeDefinition`, `MapLegend`, `WhittakerCell`, `MapConfig`, `TileOverlay`, `TopologySample`, `NeighborhoodSample`, `RenderInput`, `RenderTile`, `EntityMarker`, `VIEWPORT_COLS`, `OVERLAY_COLLECTION` |
| `topology.ts` | Procedural elevation+moisture sampling and Whittaker biome resolution. | `createTopologyEngine`, `TopologyEngine` |
| `state.ts` | DBO-backed sparse overlay store and player-coord helpers. | `getOverlay`, `getOverlaysInRegion`, `setOverlay`, `clearOverlay`, `getPlayerCoord`, `setPlayerCoord`, `validateOverlay` |
| `format.ts` | `DESCFORMAT` handler; assembles `RenderInput` from topology + overlays. | `descFormatHandler` |
| `renderer.ts` | Pure string composition: minimap + prose + sections. | `renderMap` |
| `commands.ts` | `+map` / `+map/here` / `+map/jump` softcode entry points. | (side-effect `addCmd`) |
| `commands_internals.ts` | Argument parsing shared by command handlers. | `parseCoord` |
| `config.default.ts` | Ships a working `MapConfig` (seeds, biomes, matrix). | `defaultMapConfig` |
| `index.ts` | Plugin manifest: registers `DESCFORMAT`, imports `commands.ts` for side effects. | default `IPlugin` |

## 2. Data flow on `+map`

1. Player types `+map` (or `+map/here`, `+map/jump x y z`).
2. The engine matches the regex registered in `commands.ts:50` and invokes `exec`.
3. `exec` (`commands.ts:54`) reads `u.cmd.args[0]` as the switch name and `args[1]` as the rest, stripped via `u.util.stripSubs`.
4. For the default/`here` branch, `getPlayerCoord(u.me.state)` (`state.ts:69`) extracts a validated `Coord`, falling back to `{0,0,0}`.
5. `renderForCoord` (`commands.ts:29`) builds a **synthetic target** by cloning `u.here`, injecting `state.coord`, and adding the `"map"` flag, then calls `u.util.resolveFormat(target, "DESCFORMAT", "")`.
6. The engine's format pipeline dispatches into `descFormatHandler` (registered at `index.ts:19`).
7. The handler returns the rendered string; `commands.ts:42` fires `u.send(out)`. For `/jump`, the handler additionally persists via `setPlayerCoord` (`state.ts:106`) before re-rendering.

## 3. Data flow on `look`

The standard `look` softcode path evaluates DESCFORMAT against the target room/object. **Softcode `@desc` always wins** — the engine evaluates attributes in priority order, and our handler is defensive about it:

1. Player runs `look` against a room. Engine collects formats.
2. `descFormatHandler` (`format.ts:84`) runs.
3. `isMapSector(target)` (`format.ts:34`) returns a `Coord` only when the room has `state.coord` *or* the `map` flag; otherwise it returns `null` and the handler exits with `null`, yielding to the next layer.
4. Even when the target is map-flagged, `format.ts:95` calls `u.attr.get(target.id, "DESC")` — if a softcode `@desc` exists, the handler **still returns `null`**, letting softcode take precedence.
5. Only when neither escape hatch fires does the handler load topology + overlays and call `renderMap` (`renderer.ts:146`).

Returning `null` is the contract for "I do not own this render"; the engine handles fallback resolution.

## 4. Topology engine internals

`createTopologyEngine` (`topology.ts:86`) constructs two independent samplers.

- **(a) Two Simplex fields.** `makeNoise` (`topology.ts:33`) builds a `Noise2D` per axis: one for elevation, one for moisture. They never share state.
- **(b) Per-instance `Noise` prevents mirroring.** Each `MapNoiseConfig.seed` string is hashed FNV-1a to a 32-bit int (`topology.ts:33-40`) and passed to `createNoise(seed)` from `ursamu` (v2.5.2+). Each instance carries its own permutation table — no global singleton, no per-sample reseeding. Using a single seed for both axes would correlate elevation and moisture and produce a visible diagonal mirror artefact.
- **(c) Octave summation.** `sampleField` (`topology.ts:38`) walks `cfg.octaves`, sums `amplitude * noise(x*f/scale, y*f/scale)`, divides by `Σ|amplitude|` (`topology.ts:55`), and remaps `[-1,1] → [0,1]` (`topology.ts:56`). The result is clamped — never trust floating point at boundaries.
- **(d) Z folded into 2D.** Vertical slices reuse a 2D noise function via deterministic per-Z offsets `x + z*131, y + z*977` (`topology.ts:15-16`, applied at `topology.ts:44-45`). Different Z layers therefore look uncorrelated without paying for a 3D noise.
- **(e) Whittaker first-match.** `resolveBiome` (`topology.ts:66`) iterates `matrix` top-to-bottom and returns the first cell where both axes fall in range. Order in `MapConfig.matrix` is meaningful — author rules from most specific to most general.

## 5. Sparse state model

```
+map / look
     │
     ▼
descFormatHandler ── getOverlay(centre) ──► DBO("map.overlays").findOne({key})
     │                       │
     │                       ├─ hit  → TileOverlay  (authored override)
     │                       └─ miss → null
     │
     └─► topo.sample(coord) ──────────────► TopologySample (procedural)

Renderer per tile:
   overlay?.glyph  →  use authored glyph (RenderTile.authored = true)
   else            →  use TopologySample.biome.glyph
```

`setOverlay` (`state.ts:52`) validates payload, derives `key = coordKey(...)`,
and writes through `DBO("map.overlays").update({id:key}, …)`. The collection is
sparse — only authored tiles exist. Bulk reads use `getOverlaysInRegion`
(`state.ts:25`) with a hard `REGION_MAX_TILES = 4096` ceiling
(`state.ts:50`) to bound viewport queries.

## 6. Renderer composition

Every user-derived string passes through `safeText` (`renderer.ts:16`) which
strips MUSH color codes and replaces `[`/`]` with `(`/`)`. This is the invariant
that prevents authored content from leaking into the MUSH function evaluator.

| Function | Output |
| --- | --- |
| `composeTopography` (`renderer.ts:60`) | One paragraph: a `self` phrase for the centre biome plus up to two cardinal-neighbour fragments (Moore ring N/E/S/W), deduplicated by biome id. |
| `buildMinimapLines` (`renderer.ts:79`) | One string per row; cells are `"glyph "` joined, leading space preserved for the minimap gutter. |
| `buildSplitBody` (`renderer.ts:86`) | 15×7 minimap on the left, word-wrapped prose on the right, joined with `" | "` and padded to `VIEWPORT_COLS` (78). |
| `buildInfrastructure` (`renderer.ts:105`) | One row per overlay whose `kind ∈ {infrastructure, landmark, hazard, cache}`, with glyph + coord + name + faction tag. |
| `buildContacts` (`renderer.ts:117`) | Aggregates `EntityMarker[]` by `groupKey` (falling back to `name|faction|status`); prefixes `Nx ` when grouped. |
| `buildAdjacent` (`renderer.ts:135`) | One line listing biome names for the N/S/E/W cardinals. |
| `renderMap` (`renderer.ts:146`) | Stitches header/stamp/body/dividers/footer, then truncates every line to 78 columns. |

## 7. Plugin lifecycle

| Phase | Trigger | Effect |
| --- | --- | --- |
| 1. Module load | `import "./commands.ts"` at `index.ts:11` | Side-effect `addCmd({name:"+map", …})` registers the command at parse time. |
| 2. `init()` | Engine calls `mapPlugin.init` (`index.ts:18`) | `registerFormatHandler("DESCFORMAT", descFormatHandler)` adds our handler to the DESCFORMAT chain; returns `true`. |
| 3. `remove()` | Engine calls `mapPlugin.remove` (`index.ts:23`) | `unregisterFormatHandler("DESCFORMAT", descFormatHandler)` removes the same function reference. Identity matters — anonymous wrappers would leak. |

## 8. Extension points

| Hook | How | Notes |
| --- | --- | --- |
| Custom `MapConfig` | Replace `defaultMapConfig` import in `format.ts:17` (or fork the handler) | Tune `noise.elevation.seed`, octaves, biomes, Whittaker matrix, sectors. |
| Chained `FormatHandler` | `registerFormatHandler("DESCFORMAT", yourHandler)` from another plugin | Return `null` to yield; first non-null wins. Our handler already yields on softcode `@desc`. |
| New commands reusing topology | `createTopologyEngine(cfg).sample(coord)` from any `addCmd` exec | Engine has no hidden state; safe to instantiate per call or cache. |
| Author content from other plugins | `import { setOverlay } from "@ursamu/map-plugin/state.ts"` (or query `DBO("map.overlays")` directly) | Overlays are the public write-surface; obey `validateOverlay` rules (no `[` `]`, integer coords ≤ 1e6). |
| Entity markers | Replace `entitiesInRegion` (`format.ts:76`) | Currently a stub; future work wires connected players / NPCs whose `state.coord` falls in the viewport. |
