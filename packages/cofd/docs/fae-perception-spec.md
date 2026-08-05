# Fae perception & flag-gated reality planes

**Status:** Steps 1–5 implemented; 6 queued.  
**Related:** Hedge, Mask/mien, fruit objects, future Hisil.

## Goal

TinyMUX-like dual visibility without softcode `@lock` soup:

1. **Capability flags** on actors (`fae`, `forsaken`) gate who sees which layer.
2. **Dual descriptions** on objects/rooms (material vs true).
3. **Soft** mortal view (odd labels / material DESC), not full invisibility.

## Planes (v1)

| Plane key  | Sight flag(s) | Gamelines            |
|------------|----------------|----------------------|
| material   | (everyone)     | all                  |
| fae        | `fae`          | CtL, fae-touched     |
| spirit     | `forsaken`     | WtF (later)          |

Staff does **not** auto-gain fae sight. Preview with `@set me=fae`
(clear `@set me=!fae`). Changeling template sync still grants `fae`.

## Flag sync (done)

`syncSightFlags` in `src/support/sight.ts`:

| `sheet.template` | Ensure flags   |
|------------------|----------------|
| `changeling`     | `fae`          |
| `werewolf`       | `forsaken`     |
| other            | strip managed  |

Called on **`+approve`** and **`+sheet/set template=`**.

**Sticky:** `sheet.sightSticky: string[]` keeps staff-granted flags when
the template no longer requires them (fetch, fae-touched mortal).

## Dual fields

```ts
// cofd_item (fruit etc.)
maskName?: string;   // material look
// customLabel / name = true (fae) name

// room / thing look
state.faedesc | FAEDESC
// material: state.description

// hedge room (data.hedge)
flavor?: string;       // fae / true
maskFlavor?: string;   // mortal

// hedgeway record
name: string;          // true
maskName?: string;     // mortal (default "Strange passage")
```

## Look resolution (done)

| Surface     | Behavior                                      |
|-------------|-----------------------------------------------|
| CONFORMAT   | `resolveItemLookName` / `resolveDualName`     |
| DESCFORMAT  | `resolveLookDesc` — FAEDESC if fae + set      |
| +hedge list | `resolveWayName` (maskName default)           |
| +hedge status flavor | `resolveRoomFlavor`                   |

## Fruit objects

- Kind `goblin-fruit`; stacks; `gotAt`; Wyrd cap on exit.
- `maskName` defaults: Strange / Unusual fruit / Odd scrap.

## Implementation queue

1. ~~Goblin fruit as real objects~~ **done**
2. ~~Approve-time flag sync~~ **done**
3. ~~CONFORMAT maskName~~ **done**
4. ~~Room FAEDESC~~ **done**
5. ~~Hedgeways / tokens dual names~~ **done**
6. WtF spirit plane + Hisil rooms

## Open questions

- Sticky staff-granted `fae` UX (+set sticky helper)?
- Mask-down changeling always fae sight (yes via flag on approve).
