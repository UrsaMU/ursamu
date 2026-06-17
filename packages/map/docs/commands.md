# Commands

## `+map`

Renders a procedural sector minimap centred on the caller's coordinate, with authored overlays, contacts, and adjacency drawn on top.

### Synopsis

```
+map[/<switch>] [<args>]
```

### Lock

| Command | Lock         |
| ------- | ------------ |
| `+map`  | `connected`  |

### Switches

| Switch  | Args              | Lock                         | Behavior                                                       |
| ------- | ----------------- | ---------------------------- | -------------------------------------------------------------- |
| (none)  | -                 | `connected`                  | Same as `/here`; centres on `getPlayerCoord(u.me.state)`.      |
| `/here` | -                 | `connected`                  | Centres on the caller's current coord (falls back to `0,0,0`). |
| `/jump` | `<x> <y> [z]`     | `connected` + `isBuilder(u)` | Sets `data.coord` on the caller, then renders that coord.      |

`isBuilder` is satisfied by any of: `builder`, `admin`, `wizard`, `superuser`. See [`security.md`](./security.md) for why the lock is `connected` rather than `builder+`.

### Examples

```
> +map
Renders the sector around your current coord.

> +map/here
Equivalent to bare +map; explicit form.

> +map/jump 120 -40
Moves your cursor to (120, -40, 0) and renders that sector.

> +map/jump 0 0 -3
Jumps to the underlevel at z = -3 and renders.

> +map/jump 1500000 0 0
Fails: coord magnitude exceeds 1,000,000; emits the usage string.
```

### Failure modes

User-visible error strings emitted by `commands.ts`:

- `"Permission denied — +map/jump requires builder+."` — `/jump` invoked without the builder/admin/wizard/superuser flag.
- `"Usage: +map/jump <x> <y> [z]"` — `parseCoord` returned `null`: non-integer arg, magnitude over 1,000,000, or fewer than two parts.
- `` `Unknown switch "/${sw}". See +help map.` `` — switch is neither empty, `here`, nor `jump`.
- `` `%cyNo map available at ${coord.x},${coord.y},${coord.z}.%cn` `` — `u.util.resolveFormat` produced no `DESCFORMAT` output for the synthetic target.
- `` `Jumped to ${coord.x},${coord.y},${coord.z}.` `` — success confirmation (not an error, but listed for completeness).

### See also

- [`docs/configuration.md`](./configuration.md) — viewport width, noise seed, biome tables.
- [`docs/architecture.md`](./architecture.md) — DESCFORMAT synthesis, renderer pipeline, overlay store.

## `+help map`

The in-game help text is the canonical short reference and mirrors the synopsis above. See [`help/map.md`](../help/map.md). Keep the two in sync when editing either.

## Future commands (roadmap)

Not yet implemented; contributors picking these up should wire them through the same catch-all switch pattern as `+map` and gate them in `exec` per `security.md`:

- `+map/authorize <x> <y> [z]=<kind>:<glyph>:<name>` — **not implemented.** Authors or updates an overlay at the target coord by calling `setOverlay()`. MUST add an ownership / admin check before reaching `setOverlay`; today the function has no caller-side gate.
- `+map/clear <x> <y> [z]` — **not implemented.** Deletes an overlay via `clearOverlay()`. Same ownership gating requirement as `/authorize`.
- `+map/seed <seed>` — **not implemented.** Re-seeds the world generator; admin-only. Will need to invalidate any cached neighborhood samples.
