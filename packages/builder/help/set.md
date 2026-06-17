---
topic: "@set"
section: building
---

# @set

Set flags or soft attributes on an object. Attribute names: letters, digits,
underscores only. Max value: 4096 chars. Max 100 attributes per object.

## Syntax
  `@set <target>=<FLAG>`              add a flag
  `@set <target>=!<FLAG>`             remove a flag
  `@set <target>=<F1> <F2> <!F3>`    set/unset multiple flags
  `@set <target>/<ATTR>=<value>`      set a soft attribute
  `@set <target>/<ATTR>=`             clear a soft attribute

## Examples
  `@set here=DARK`
  `@set here=!DARK`
  `@set me=WIZARD !BUILDER`
  `@set here/climate=cold and stormy`
  `@set here/climate=`

## See Also
  `&ATTR`, `@wipe`, `@examine`
