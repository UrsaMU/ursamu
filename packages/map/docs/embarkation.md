# Embarkation

Cross-links: [entities](./entities.md), [fog-of-war](./fog-of-war.md), [architecture](./architecture.md).

## Why embarkation

Players are deliberately cordoned off from the map. There is no `+move` for a bare player — the command finds no active entity and refuses. The only way onto the grid is to embark, launch, or link to a `MapEntity`. Read [entities](./entities.md) for the data model before continuing; this doc covers the user-facing flows.

## Setup: marking a vehicle

```
@set <thing>=map-capable
```

This sets `MAP_CAPABLE_FLAG` on the in-game object. Optional builder steps:

| Attribute | Effect |
| --- | --- |
| `state.coord` | Suggested launch coord. If unset, launch uses the caller's last-known map coord, falling back to `(0,0,0)`. |
| `state.lastDock` | Overrides the default dock-back room. If unset, the room the vehicle was in at launch time is recorded automatically. |

## Board flow (object rules)

Vehicles are ordinary things. Prefer engine commands:

```
enter <vehicle>
leave
```

`+map/embark` / `+map/disembark` are thin aliases of `enter` / `leave`
(embark still requires `map-capable` so casual `enter` on non-map
objects is not confused with map boarding).

| Check | How |
| --- | --- |
| Nearby | Same room (or held) |
| Enter lock | `@lock/enter`, else `enter_ok`, else owner/staff |
| Seat cap | optional `&CAPACITY` / `&MAPCAPACITY` |
| Players | default **locked** (no free entry into bodies) |

On success the caller is moved into the vehicle's contents. No
`MapEntity` yet — that happens on `+map/launch`.

## Launch flow

```
+map/launch
```

Run from inside the vehicle. Effects:

1. Reads vehicle's `state.coord` (or falls back as noted above).
2. Records the vehicle's current room dbref into `entity.lastDock`.
3. Creates a `MapEntity` with `containerId = vehicle.dbref`, `glyph`, `vision`, `factionId` pulled from vehicle state.
4. Moves the vehicle object out of the real room into the synthetic in-map holding location.

All passengers ride along — they were already inside the vehicle's contents.

## Movement (only while launched)

```
+move n | s | e | w | ne | nw | se | sw | u | d
```

Resolution order matches [entities](./entities.md#containment-vs-link-model-hybrid). For the typical pilot:

1. Resolve active entity via containment.
2. Compute next coord.
3. Reject if outside `MapConfig.bounds`.
4. Reject if destination overlay has `blocksMovement: true`.
5. Reject if destination biome `traversal = "impassable"`.
6. `moveEntity(id, next)` writes the new coord; renderer re-runs on next `+map`.

Bare players (no active entity) receive `You have no map presence.`

## Land flow

```
+map/land
```

Effects:

1. Refuses on impassable terrain (you cannot disembark crew into lava).
2. Moves the vehicle object back to `entity.lastDock`.
3. Destroys the `MapEntity`.
4. Clears `lastDock`.

Passengers are still inside the vehicle's contents — they remained there throughout the flight. They can now `+map/disembark`.

## Leave / disembark flow

```
leave
+map/disembark   # alias
```

- Vehicle in real-room space (post-land): caller exits into the
  vehicle's current room (same dock).
- Vehicle still on the map (`container.location` starts with
  `map:`): **refused** — `+map/land` first so the vehicle and any
  other passengers stay consistent. No silent lastDock eject.

## Link (remote) mode

```
+map/link <entityId>
+map/unlink
```

For scouts, fixed structures, drones — anything the player operates without sitting inside it. Sets `state.mapControlling = entityId` on the caller; refuses unless the entity's `controllerId` already matches the caller's dbref (the entity must have been authored to accept this controller).

`+map/unlink` clears `state.mapControlling`. The entity remains in the world; only the operator is detached.

## Admin spectate

```
+map/spectate <entityId>
+map/unspectate
```

Wizard / superuser / admin only. Sets `state.mapSpectating`. Renderer flips to spectator mode (see [fog-of-war](./fog-of-war.md#spectator-mode)). Movement commands refuse while spectating — this is purely observational.

## Failure modes

Enumerated error strings from `commands.ts`:

| Message | Cause | Fix |
| --- | --- | --- |
| `You have no map presence.` | No containment, no link, no spectate. | enter + launch, or link, or admin-spectate. |
| `That is not map-capable.` | Embark alias on non-map thing. | `@set <thing>=map-capable`, or use `enter`. |
| `You can't enter that.` | No enter_ok / lock / ownership. | `@set <v>=enter_ok` or `@lock/enter`. |
| `I can't find that here.` | Target not nearby. | Move to the same room first. |
| `You can't leave while this is on the map.` | leave before land. | `+map/land` then `leave`. |
| `You aren't inside a map-capable vehicle.` | `+map/launch` from outside. | enter first. |
| `Already launched.` | Vehicle already has a `MapEntity`. | Use `+map/land` first. |
| `Nothing to land — you aren't in a launched vehicle.` | `+map/land` with no active entity. | Confirm you launched. |
| `Cannot land on impassable terrain.` | Destination biome / overlay forbids landing. | Move to a landable tile. |
| `Out of bounds.` | Move would exit `MapConfig.bounds`. | Move another direction. |
| `Blocked.` | Destination overlay has `blocksMovement` or biome is impassable. | Route around. |
| `That entity does not accept you as controller.` | `controllerId` mismatch on `+map/link`. | Builder sets the entity's `controllerId` first. |
| `You aren't linked.` | `+map/unlink` without an active link. | n/a |
| `Permission denied.` | Non-admin tried `/spectate`, `/jump`, `/stats`. | Get a wizard to do it. |
| `No such entity.` | Bad id passed to `/link` or `/spectate`. | Confirm id via `/stats`. |
