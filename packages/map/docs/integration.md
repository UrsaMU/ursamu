# Integration Guide

How to wire `@ursamu/map-plugin` into an existing UrsaMU game.

## 1. Prerequisites

| Requirement | Version | Why |
| --- | --- | --- |
| UrsaMU engine | `>=2.3.0` | Provides `registerFormatHandler`, plus the `header` / `divider` / `footer` native helpers the renderer leans on. |
| Deno | Whatever the engine pins | Plugin uses `--unstable-kv` for the DBO collection. |

## 2. Install

```sh
deno add jsr:@ursamu/map-plugin
```

Add the plugin to your game's plugin manifest (typically `ursamu.config.json` or your loader entrypoint), then restart the engine:

```json
{
  "plugins": ["@ursamu/map-plugin"]
}
```

## 3. First boot

What happens the first time the engine loads the module:

1. Importing `./commands.ts` (side effect of `index.ts`) calls `addCmd` and registers the `+map` command.
2. The plugin's `init()` calls `registerFormatHandler("DESCFORMAT", descFormatHandler)`.
3. The DBO collection `map.overlays` is lazy. No migrations, no seed data. It is created on first write.

That is the whole boot sequence. No env vars, no extra services.

## 4. Wiring player coords

New players do NOT automatically get a `state.coord`. Three ways to handle this:

- **(a) Set it during chargen.** From your character-creation flow, write the coord directly:

  ```ts
  await u.db.modify(playerId, "$set", { "data.coord": { x: 0, y: 0, z: 0 } });
  ```

- **(b) Hook `player:create`.** Add a listener from your own plugin or game template:

  ```ts
  import { gameHooks } from "ursamu";

  gameHooks.on("player:create", async (u, player) => {
    await u.db.modify(player.id, "$set", { "data.coord": { x: 0, y: 0, z: 0 } });
  });
  ```

- **(c) Do nothing.** `+map/here` falls through to `(0, 0, 0)` as the implicit default — see `commands.ts:70`. Fine for prototypes, surprising in production.

## 5. Authoring overlays from another plugin

Once `@ursamu/map-plugin` is published you can import `setOverlay` directly. Until then, fork or wrap the module.

```ts
import { setOverlay } from "@ursamu/map-plugin";

export async function placeLandmark(u, builder, name: string) {
  const here = builder.state.coord; // assumes you've wired coords
  await setOverlay({
    x: here.x, y: here.y, z: here.z,
    kind: "landmark",
    name,
    glyph: "*",
  });
}
```

Security note: `setOverlay` throws on invalid payloads (`validateOverlay` rejects out-of-range coords, multi-char glyphs, bracketed text). There is NO built-in ownership check. Callers MUST gate writes with `canEdit`, the `builder` flag, or admin/wizard before invoking.

## 6. Themes / `MapConfig`

```json
{ "plugins": { "map": { "theme": "hedge", "realm": "default" } } }
```

- `"default"` — stock pack (`config.default.ts`)
- `"hedge"` / `"court"` — CtL Hedge pack (`config/hedge.ts`)

Siblings can also call `registerMapConfig(realmId, cfg)` at init.

## 7. REST routes

Bearer-auth under `/api/v1/map/` (also allowed on staff admin WS):

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/realm/:id/render?center=&radius=` | any auth | tile grid |
| GET | `/player/:id` | any auth | player coord |
| GET | `/entities` | builder+ | MapEntity roster |
| POST | `/prune` | admin | orphans + stranded |
| POST | `/overlay` | admin | author tile |
| DELETE | `/overlay?x=&y=&z=` | admin | clear tile |

Staff UI: `/admin/map` when `@ursamu/web` is loaded.

## 8. Performance budget

Region scans use an in-process **chunk index** (`spatial.ts`,
CHUNK_SIZE=32). First query after a write rebuilds from
`overlays.all()` / `entities.all()`; subsequent viewport queries only
inspect intersecting chunks. Still rebuild the index after bulk
imports via a process restart or write path.

## 9. Removing the plugin

`remove()` calls `unregisterFormatHandler("DESCFORMAT", descFormatHandler)` with the same reference registered in `init()`, so re-bind hygiene is correct.

Overlays in the `map.overlays` DBO collection persist after removal. To rip them out:

- Per-tile: call `clearOverlay({ x, y, z })`.
- Wholesale: drop the `map.overlays` collection from your storage backend.

## 10. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `look` on a player shows nothing about the map | DESCFORMAT correctly returned `null` — player has no `state.coord` AND no `map` flag | Set their coord (section 4) or flag the target `map` |
| Render shows only one biome glyph everywhere | `defaultMapConfig`'s Whittaker matrix has limited variety, or your custom matrix has gaps that fall through to `biomes[0]` | Audit your matrix coverage |
| `+map/jump` says permission denied | Caller lacks `builder` / `admin` / `wizard` / `superuser` flag | Grant the flag |
| Render says `(none surveyed)` | No overlays with `kind in {infrastructure, landmark, hazard, cache}` inside the viewport | Set `overlay.kind` to one of those values when authoring |
