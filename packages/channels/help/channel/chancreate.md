---
dark: true
---
See also: +help channel (overview)

+CHANCREATE

  Create, destroy, or reconfigure game chat channels (admin only).

SYNTAX
  @chancreate <name>[=<header>]
  @chancreate/hidden <name>[=<header>]
  @chancreate/lock <name>=<lock>
  @chandestroy <name>
  @chanset <name>/<property>=<value>

  Aliases: @ccreate, @cdestroy, @cset

EXAMPLES
  @ccreate Staff
  @ccreate/hidden Admin=[ADMIN]
  @cdestroy temp-ooc
  @cset public/header=[PUB]
  @cset public/hidden=on

SEE ALSO: +help channel/setup, +help channel/locks
