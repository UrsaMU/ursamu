---
topic: "action-attrs/move"
section: building
---

# Action Attrs — Movement

See also: +help action-attrs (overview)

Set on the **exit** object. `@lock/leave` and `@lock/enter` use the
room's `FAIL`/`OFAIL` attrs when denied.

## Attributes
- `LEAVE` / `OLEAVE` / `ALEAVE` — actor / room left / exit owner (departure)
- `ENTER` / `OENTER` / `AENTER` — actor / destination / exit owner (arrival)
- `FAIL` / `OFAIL` / `AFAIL` — actor / room / owner (lock denied)

## Examples
  `&OLEAVE north=heads north toward the mountains.`
  `&OENTER north=arrives from the south.`
  `@lock/enter here=WIZARD`
  `&FAIL here=You are not permitted here.`

## See Also
  `action-attrs`, `@lock`, `@dig`, `@open`
