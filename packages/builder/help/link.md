---
topic: "@link"
section: building
---

# @link

Link a target to a destination. Meaning depends on object type.

## Syntax
  `@link <target>=<dest>`
  `@link <target>=home`

## Notes
- **Room** — sets the room's dropto.
- **Exit** — sets the exit's destination.
- **Thing/player** — sets the object's home.
- `home` resolves to your current room without needing its dbref.

## Examples
  `@link North;N=The Tavern`
  `@link here=home`
  `@link #12=#5`

## See Also
  `@unlink`, `@open`, `@dig`
