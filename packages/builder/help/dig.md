---
topic: "@dig"
section: building
---

# @dig

Create a room. Optionally create exits to and from the new room.
Costs 1 quota per room (staff exempt). Room names up to 200 characters.

## Syntax
  `@dig <room>`
  `@dig <room>=<exit>`
  `@dig <room>=<exit>,<back>`
  `@dig/teleport <room>`

## Switches
- `/teleport` — move into the new room after creating it.

## Examples
  `@dig Storage Room`
  `@dig/teleport The Tavern`
  `@dig Market Square=North;N,South;S`

## See Also
  `@open`, `@link`, `@quota`
