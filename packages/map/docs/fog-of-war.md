# Fog of War

Cross-links: [entities](./entities.md), [embarkation](./embarkation.md), [architecture](./architecture.md).

The map plugin implements four cooperating visibility layers. Together they answer "what tile does this viewer see, and how does it look?" Every layer is computed per render — there is no persistent visibility cache other than the explored-memory DBO.

## The four FoW layers

```
            ┌────────────────────────────────────────────┐
            │   terrain occlusion (filters everything)   │
            └────────────────────────────────────────────┘
                                ▲
                                │
   ┌────────────────────────────────────────────────────┐
   │           faction-shared live (UNION)              │
   │   ┌────────────────────────────────────────────┐   │
   │   │              this-entity live              │   │
   │   └────────────────────────────────────────────┘   │
   └────────────────────────────────────────────────────┘
                                +
   ┌────────────────────────────────────────────────────┐
   │      explored memory (everything ever seen)        │
   └────────────────────────────────────────────────────┘
```

- **Live vision.** What this entity sees right now.
- **Faction-shared union.** OR of all faction members' live sets — your scout's eyes are your eyes.
- **Explored memory.** What's been live-visible at any point in the past, subject to TTL.
- **Terrain occlusion.** Acts on all of the above: rays are blocked the same way for live and for the memory-write step.

## Live vision

For a viewer entity at `viewer.coord` with `viewer.vision = R`:

- Iterate every `(dx, dy)` with `max(|dx|, |dy|) <= R` (Chebyshev disk; square in screen space).
- The centre tile `(0,0)` is always live regardless of occlusion.
- Trace a Bresenham ray from `viewer.coord` to `(viewer.x+dx, viewer.y+dy)` on the same `z`.
- Accumulate `occludes` along the ray; if cumulative `>= 1.0` before reaching the target, the target is not visible.
- **Z separates absolutely.** No cross-plane visibility, full stop. A flier at `z=1` cannot see anything on `z=0` and vice versa.

## Terrain occlusion

Two sources, in priority order:

| Source | Field | Default |
| --- | --- | --- |
| `TileOverlay.occludes` | per-tile override | unset |
| `BiomeDefinition.occludes` | per-biome base | `0` |

`0` = transparent, `1` = full wall, fractional = partial. A `forest` biome at `0.5` means light passes through one forest tile but is fully blocked after two cumulative forest steps.

**Worked example.** Entity at `(0,0,0)` with `vision = 5`, ringed by a single-tile ridge at radius 1 where every ridge tile has `occludes = 1.0`:

- All 8 ridge tiles themselves are visible (the ray reaches them before occlusion accumulates).
- Every tile at radius 2+ is fully blocked. Entity effectively sees a 3×3 disk.

A vision-5 unit in open `plains` (`occludes = 0`) sees the full 11×11 Chebyshev box.

## Faction-shared vision

```ts
unionLiveVisible(entities: MapEntity[], occlusion): Set<string>
```

Filter entities by `factionId === viewerFaction`, compute each one's live set, OR them all together. A single-entity faction gets results identical to live alone. A scout deployed forward of the line illuminates everything in its disk for every faction-mate.

`hidden: true` entities are still allowed to contribute their own vision — they just do not appear as targets in anyone else's live set.

## Memory (explored fog)

DBO collection `map.fog` (`FOG_COLLECTION`). Row schema is `FogRecord`:

| Field | Notes |
| --- | --- |
| `key` | `` `${ownerId}|${x},${y},${z}` `` |
| `ownerId` | `factionId ?? controllerId ?? entity.id` |
| `x`, `y`, `z` | tile coord |
| `glyph` | glyph at the moment of last sighting |
| `kind`, `name` | optional overlay-derived hints |
| `lastSeenAt` | `Date.now()` |

**Ownership.** Memory is keyed by whoever has standing to remember it. Factioned entities share memory under the faction id; factionless entities under the controlling player's dbref; pure AI under the entity id.

**TTL.** `MapConfig.memoryTtlSeconds ?? DEFAULT_MEMORY_TTL_SECONDS = 3600`. Records older than TTL are filtered out at read time. Renderer treats stale memory as never-seen.

**Writes.** Every render writes a memory row for every tile in the viewer's live set. Render is the only path that produces memory; there is no offline backfill.

## Render hierarchy

Per tile inside the viewport:

| Tile state | Glyph rendered | Colour |
| --- | --- | --- |
| In live set | normal glyph (overlay > biome) | normal |
| In memory only | memory's `glyph` | dim (per `legend.fogMemory`, default `.`) |
| Neither | `legend.fog` (default `?`) | dim |

Entities at coords not in the live set are dropped from the SECTOR CONTACTS section. Memory does not remember entities — only tiles.

## Spectator mode

Admin runs `+map/spectate <entityId>`. The renderer is invoked with `RenderInput.spectator = true` and visibility is computed from the spectated entity's eyes — its vision radius, its faction, its memory. The admin sees what that entity sees, no more, no less. Read-only; movement commands refuse while spectating.

## Performance

- Per-render cost: `O(R² × R)` rays where `R = viewer.vision`. For `vision = 5` that is ~625 tiles × ~5 step rays ≈ 3k integer ops.
- Memory batch write: `O(R²)` upserts into `map.fog`.
- Region read for faction union: `entitiesInRegion(viewport)` is currently a full collection scan capped by the same `REGION_MAX_TILES` bound as overlays.
- Acceptable for V1. A chunk-key index over `map.fog` and `map.entities` is on the roadmap once the working set grows.
