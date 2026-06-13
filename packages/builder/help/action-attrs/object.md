---
topic: "action-attrs/object"
section: building
---

# Action Attrs — Drop & Use

## Attributes
**Drop** (fires on `drop`):
- `DROP` / `ODROP` / `ADROP` — actor / room / owner

**Use** (fires on `use`):
- `USE` / `OUSE` / `AUSE` — actor / room / owner
- `FAIL` / `OFAIL` / `AFAIL` — actor / room / owner (use lock denied)

Lock the use slot: `@lock/use <obj>=<key>`

## Examples
  `&DROP torch=You drop the torch; it flickers but stays lit.`
  `&ODROP torch=drops the torch onto the floor.`
  `&USE lever=You pull the lever. A door grinds open somewhere.`
  `@lock/use lever=WIZARD`

## See Also
  `action-attrs` (overview), `action-attrs/get`, `use`, `@lock`
