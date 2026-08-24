---
dark: true
---
See also: +help staff (overview)

+CREATE

  Create or destroy channels (admin+).

SYNTAX
  @chancreate <name>[=<header>]
  @chancreate/hidden <name>[=<header>]
  @chancreate/lock <name>=<key>
  @chandestroy <name>

  Aliases: @ccreate, @cdestroy.
  Lock keys: +help staff/locks

EXAMPLES
  @ccreate Staff
  @ccreate/lock Admin=connected admin+
  @ccreate/hidden OOC=[OOC]
  @cdestroy temp-ooc

SEE ALSO: +help staff/locks, +help staff/chanset
