# Commands

In-game help: `+help map` (and `map/setup`, `map/switches`,
`map/builder`). Keep those files in sync with this doc.

## Model (read first)

Players **do not** stand on the grid alone. Vehicles are normal
objects. Flow:

1. Builder creates a thing; `@set` **`map-capable`** + **`enter_ok`**
   (or `@lock/enter`). Optional `&CAPACITY`.
2. Player **`enter`s** the vehicle, then `+map/launch`es.
3. A `MapEntity` is created; `+map` / `look` / `+move` work.
4. `+map/land` docks; **`leave`** exits the vehicle.
5. `leave` while the vehicle is still on the map (`map:…`) is
   refused — land first.

`+map/embark` / `+map/disembark` are aliases of enter/leave
(embark still requires `map-capable`).

## `+map`

```
+map[/<switch>] [<args>]
```

Lock: `connected` (extra gates inside exec).

| Switch | Args | Who | Behavior |
|--------|------|-----|----------|
| (none) / `/here` | — | player | Render sector for active entity |
| `/embark` | `<target>` | player | Alias of `enter` (map-capable only) |
| `/disembark` | — | player | Alias of `leave` |
| `/launch` | — | owner/admin | Create MapEntity; enter grid |
| `/land` | — | owner/admin | Destroy entity; return to dock |
| `/authorize` | `x y [z] [realm]=kind:glyph:name` | builder+ | Place overlay |
| `/clear` | `x y [z] [realm]` | builder+ | Remove overlay |
| `/link` | `<entityId>` | builder+ | Remote pilot |
| `/unlink` | — | player | Clear remote link |
| `/spectate` | `<entityId>` | admin | Watch vision |
| `/unspectate` | — | admin | Stop spectating |
| `/stats` | — | builder+ | Overlays + entities |
| `/prune` | — | admin | Drop orphan entities |
| `/jump` | `x y [z] [realm]` | admin | Teleport active entity |

### Examples

```
@create Scout
@set Scout=map-capable enter_ok
&CAPACITY Scout=4
drop Scout
enter Scout
+map/launch
+map
+move ne
+map/authorize 0 0=infrastructure:#:Bunker
+map/land
leave
```

### Failure strings (selected)

- `You have no map presence…` — not entered/launched/linked
- `That is not map-capable.` — embark alias only
- `You can't enter that.` — no enter_ok / lock / ownership
- `You can't leave while this is on the map.` — land first
- `… is full (n/m).` — capacity
- `Already launched. Use +map/land first.`
- `Permission denied — …` — lock gate inside switch

## `+move`

```
+move <dir>
```

Dirs: `n s e w ne nw se sw u d` (long forms ok).  
Requires active entity. Honors biome/overlay blocks and move guards.

## Theme config

```json
{
  "plugins": {
    "map": { "theme": "hedge", "realm": "default" }
  }
}
```

`default` | `hedge` | `court`

## See also

- [embarkation.md](./embarkation.md)
- [entities.md](./entities.md)
- [fog-of-war.md](./fog-of-war.md)
- [security.md](./security.md)
