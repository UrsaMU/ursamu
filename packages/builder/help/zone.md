---
topic: "@zone"
section: building
---

# @zone

Manage Zone Master Objects (ZMOs). A ZMO groups related rooms under a named
area. One zone per room — assigning a new zone overwrites the old one.

## Syntax
  `@zone/create <name>`
  `@zone/destroy <name>`
  `@zone/add [<room>=]<zone>`
  `@zone/remove [<room>=]<zone>`
  `@zone/list [<zone>]`
  `@zone/info <zone>`

## Examples
  `@zone/create Market District`
  `@zone/add here=Market District`
  `@zone/list`

## See Also
  `+help zone/more`
