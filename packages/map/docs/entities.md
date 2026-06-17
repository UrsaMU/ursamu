# Map Entities

Cross-links: [fog-of-war](./fog-of-war.md), [embarkation](./embarkation.md), [architecture](./architecture.md).

## Why entities exist

Pre-2.0, the map plugin read `state.coord` directly off the player object. That made every connected player a free-floating coordinate carrier — walk in any direction, no friction, no narrative gating. The 2.0 model inverts this: **players do not have coordinates; entities do.** The pieces of the world that move (vehicles, squads, scouts, structures) are `MapEntity` records. Players ride or operate them.

This collapses the "how does a player reach the map" question into a single answer — they boarded something map-capable, or they're linked to a remote asset, or they're an admin spectating. There is no fourth path.

## The MapEntity contract

Defined in `schemas.ts`.

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable entity id. Used as DBO key. |
| `coord` | `Coord` | yes | Current `{x,y,z}` on the map. |
| `glyph` | `Glyph` | yes | Single Latin-1 char drawn in the viewport. |
| `kind` | `string` | yes | Free-form category: `vehicle`, `squad`, `scout`, `structure`, ... |
| `factionId` | `string?` | no | Faction tag. Drives shared-vision union. |
| `containerId` | `string?` | no | dbref of the UrsaMU object passengers ride inside. |
| `controllerId` | `string?` | no | dbref of the player operating remotely (link model). |
| `name` | `string` | yes | Display name in contacts + spectate. |
| `status` | `string?` | no | One-line flavour string. |
| `vision` | `number` | yes | Chebyshev sight radius. `0` = blind. Capped at `MAX_VISION = 30`. |
| `hidden` | `boolean?` | no | If true, excluded from other entities' live vision. |
| `lastDock` | `string?` | no | Real-room dbref to land back to. Empty while in-map. |

## Containment vs link model (hybrid)

Two ways a player attaches to an entity. Both can be true at once (you ride your own command vehicle while also linking to a scout drone), but only one is "active" for the renderer at a time.

| Mode | Player state | Entity state | When to use |
| --- | --- | --- | --- |
| Containment | `u.me.location` is the vehicle dbref | `entity.containerId = vehicle.dbref` | Pilots, passengers, embarked crew. |
| Link | `u.me.state.mapControlling = entity.id` | `entity.controllerId = u.me.id` | Scouts, fixed structures, drone operators. |

**Resolution order for "which entity is this player driving?"** (used by `+move`, `+map`, look):

1. Spectate — admin's `state.mapSpectating` points at an entity (read-only).
2. Containment — find `MapEntity` whose `containerId` equals `u.me.location`.
3. Link — find `MapEntity` whose `id` equals `u.me.state.mapControlling` *and* whose `controllerId` equals `u.me.id`.
4. None — player has no map presence; commands refuse.

## The MAP_CAPABLE flag

```
@set <thing>=map-capable
```

`MAP_CAPABLE_FLAG = "map-capable"` (`schemas.ts`). The flag on `u.me.location` is the primary passenger gate. Without it, `+map/embark` refuses, `+map/launch` refuses, and the descformat handler treats the object as a normal room. Builders apply it to vehicles, command pods, scout drones — anything intended to carry a `MapEntity`.

## DBO collection

`ENTITY_COLLECTION = "map.entities"`. One row per entity, keyed by `entity.id`. Schema is `MapEntity` verbatim.

## Validation invariants

`validateEntity` mirrors `validateOverlay`:

| Rule | Threshold |
| --- | --- |
| `coord.{x,y,z}` integer in range | `|n| <= 1_000_000` |
| `glyph` length | exactly 1 char, Latin-1 |
| `vision` | `0 <= vision <= MAX_VISION (30)` |
| No `[` or `]` in `name`, `kind`, `status` | enforced |
| `name`, `kind` length | `<= 80` chars |
| `status` length | `<= 200` chars |
| `id`, `containerId`, `controllerId`, `lastDock` length | `<= 80` chars |

## Lifecycle

Exported from `entities.ts`:

```ts
setEntity(entity: MapEntity): Promise<void>;
moveEntity(id: string, next: Coord): Promise<MapEntity>;
destroyEntity(id: string): Promise<void>;
getEntity(id: string): Promise<MapEntity | null>;
entitiesInRegion(min: Coord, max: Coord): Promise<MapEntity[]>;
```

- `setEntity` validates and upserts.
- `moveEntity` validates the destination against `MapConfig.bounds` and `TileOverlay.blocksMovement`, then writes.
- `destroyEntity` removes the record. Callers should clear `lastDock` and any linked player's `state.mapControlling` first.

## Cross-plugin authoring

Another plugin spawning an NPC squad:

```ts
import { setEntity } from "@ursamu/map-plugin/entities.ts";

await setEntity({
  id: "npc.squad.bravo",
  coord: { x: 144, y: 219, z: 0 },
  glyph: "B",
  kind: "squad",
  factionId: "Hostile",
  name: "B2-Super Battle Droid squad",
  status: "advancing through the brush",
  vision: 4,
});
```

No container, no controller — pure AI-driven entity. The faction tag means any Hostile player linked to a Hostile entity sees through this squad as well.
