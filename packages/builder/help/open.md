---
topic: "@open"
section: building
---

# @open

Create an exit from your current room to a destination.
Use `;` to separate name from aliases (e.g. `North;N`). Max 200 characters.

## Syntax
  `@open <exit>=<room>`
  `@open <exit>=<room>,<back>`
  `@open/inventory <exit>=<room>`

## Switches
- `/inventory` — place the exit in your inventory, not the current room.

## Examples
  `@open North;N=The Tavern`
  `@open East;E=The Library,West;W`
  `@open/inventory Gate=Courtyard`

## See Also
  `@dig`, `@link`, `@unlink`
