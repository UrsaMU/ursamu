---
topic: "use"
section: building
---

# use

Activate an object, triggering its **USE**, **OUSE**, and **AUSE** attributes.

## Syntax
  `use <object>`

## Notes
- `USE` — shown to you. `OUSE` — broadcast to the room (excluding you).
- `AUSE` — sent to the object's owner.
- Set `@lock/use <obj>=<key>` to restrict access. On failure, `FAIL`,
  `OFAIL`, and `AFAIL` fire instead.
- The object must be in the room or your inventory.

## Examples
  `use lever`
  `use #12`
  `use crystal orb`

## See Also
  `action-attrs`, `@lock`
