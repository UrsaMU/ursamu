---
topic: "action-attrs/look"
section: building
---

# Action Attrs — Look

See also: +help action-attrs (overview)

## Notes
- **IDESC** replaces **DESC** when the viewer is inside the object (e.g. a
  container or room that looks different from within).
- **ODESC** fires when someone looks at the object from outside; broadcast
  to the room with the looker's name prepended.
- Format override attrs change room rendering: `CONFORMAT`, `EXITFORMAT`,
  `NAMEFORMAT`, `DESCFORMAT`.

## Examples
  `&DESC vault=A heavy iron vault, sealed shut.`
  `&IDESC vault=The velvet-lined interior glitters with treasure.`
  `&ODESC painting=studies the painting for a long moment.`

## See Also
  `action-attrs`, `@desc`, `look`, `CONFORMAT`
