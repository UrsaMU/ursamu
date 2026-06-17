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

## 6. Replacing `defaultMapConfig`

Known limitation. `format.ts` imports `defaultMapConfig` from `./config.default.ts` directly. There is no DI seam today. To use your own biome matrix, sector table, or viewport size you must either fork the plugin or send a PR that externalizes config injection. Tracked as a roadmap item.

## 7. REST routes

None today. If you need a map-tile API, register routes from a wrapper plugin until this one ships its own router:

```ts
registerPluginRoute("/api/v1/map", handler);
```

## 8. Performance budget

Every `look` on a map-flagged target triggers:

1. One DESCFORMAT handler call.
2. One `getOverlay(centre)` lookup.
3. One `getOverlaysInRegion(...)` scan — the default viewport (15x7 = 105 tiles) gates the request, then `overlays.all()` is loaded into memory and filtered.
4. 105 topology samples plus 8 neighborhood samples per render.

Because `getOverlaysInRegion` does `overlays.all()`, every look is O(total_overlays). The `REGION_MAX_TILES = 4096` cap is a safety net against pathological requests, NOT a perf budget. Plan to add a chunk-key index before you cross ~10k overlays.

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
