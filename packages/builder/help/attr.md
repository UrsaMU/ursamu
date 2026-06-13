---
topic: "&ATTR"
section: building
---

# &ATTR

Shorthand to set a named attribute on an object.

## Syntax
  `&ATTR <obj>=<value>`
  `&ATTR <obj>=`              clears the attribute

## Notes
- Max attribute value: 4096 characters. Max 100 attributes per object.

## Examples
  `&DESCRIPTION me=A tall elf with silver hair.`
  `&CLIMATE here=warm and humid`
  `&NOTES #12=Found near the docks.`
  `&NOTES #12=`

## See Also
  `@set`, `@wipe`
