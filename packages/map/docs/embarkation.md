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

## Embark flow

```
+map/embark <vehicle>
```

Requirements:

| Check | Failure message |
| --- | --- |
| Target exists, same room as caller | `You don't see that here.` |
| Target has `MAP_CAPABLE_FLAG` | `That isn't map-capable.` |
| Vehicle has free passenger slot (always true in V1) | n/a |

On success the caller is moved into the vehicle's UrsaMU contents. No `MapEntity` is created yet — embarking is the in-room boarding step.

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

## Disembark flow

```
+map/disembark
```

- Vehicle in real-room space (post-land): caller exits into the same real room.
- Vehicle still on the map (rare; e.g. a stopped ground vehicle): caller is placed at `lastDock`. This is nonsensical for a flying vehicle and the command does not enforce vehicle-kind semantics; builders are responsible.

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
| `You have no map presence.` | No containment, no link, no spectate. | Embark + launch, or link to an entity, or admin-spectate. |
| `That isn't map-capable.` | Target lacks `map-capable` flag. | Builder runs `@set <thing>=map-capable`. |
| `You don't see that here.` | Embark target not in caller's room. | Move to the same room first. |
| `You aren't inside a map-capable vehicle.` | `+map/launch` from outside any vehicle. | Embark first. |
| `Already launched.` | Vehicle already has a `MapEntity`. | Use `+map/land` first. |
| `Nothing to land — you aren't in a launched vehicle.` | `+map/land` with no active entity. | Confirm you launched. |
| `Cannot land on impassable terrain.` | Destination biome / overlay forbids landing. | Move to a landable tile. |
| `Out of bounds.` | Move would exit `MapConfig.bounds`. | Move another direction. |
| `Blocked.` | Destination overlay has `blocksMovement` or biome is impassable. | Route around. |
| `That entity does not accept you as controller.` | `controllerId` mismatch on `+map/link`. | Builder sets the entity's `controllerId` first. |
| `You aren't linked.` | `+map/unlink` without an active link. | n/a |
| `Permission denied.` | Non-admin tried `/spectate`, `/jump`, `/stats`. | Get a wizard to do it. |
| `No such entity.` | Bad id passed to `/link` or `/spectate`. | Confirm id via `/stats`. |
