---
topic: "action-attrs/get"
section: building
---

# Action Attrs — Get & Give

See also: +help action-attrs (overview)

Attributes fire on `get` / `give`. Lock with `@lock <obj>=<key>`.

## Attributes
- `SUCC` / `OSUCC` / `ASUCC` — actor / room / owner (lock passed)
- `FAIL` / `OFAIL` / `AFAIL` — actor / room / owner (lock failed)

## Examples
  `&SUCC sword=You grasp the hilt and feel its power.`
  `&FAIL sword=The sword refuses to leave its pedestal.`
  `@lock sword=wizard`

## See Also
  `action-attrs`, `@lock`, `use`
