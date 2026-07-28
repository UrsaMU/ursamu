---
dark: true
---
See also: +help staff (overview)

+CREATE

  Create or destroy channels (admin+).

SYNTAX
  @chancreate <name>[=<header>]
  @chancreate/hidden <name>[=<header>]
  @chancreate/lock <name>=<lock>
  @chandestroy <name>

  Aliases: @ccreate, @cdestroy. Destroy removes history.

EXAMPLES
  @ccreate Staff
  @ccreate/hidden Admin=[ADMIN]
  @cdestroy temp-ooc

SEE ALSO: +help staff/chanset, +help staff/locks
