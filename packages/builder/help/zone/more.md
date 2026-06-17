---
topic: "@zone/more"
section: zone
---

# @zone — Switches & More Examples

See also: +help zone (overview)

## Switches
- `/create` — create a new ZMO.
- `/destroy` — destroy the ZMO and unlink all its rooms.
- `/add` — link a room to a zone (defaults to current room).
- `/remove` — unlink a room from its zone.
- `/list` — list all zones, or rooms in a specific zone.
- `/info` — show zone details and room count.

## Notes
- Destroying a ZMO unlinks all its rooms but does not destroy them.

## Examples
  `@zone/list Market District`
  `@zone/info Market District`
  `@zone/remove here=Market District`
  `@zone/destroy Market District`
