---
dark: true
---
See also: +help staff (overview)

+LOCKS

  Restrict who may join or use a channel (admin+).

SYNTAX
  @chancreate/lock <channel>=<lock>
  @chanset <channel>/lock=<lock>

  Locks are standard UrsaMU lock strings (flags, perm, etc.).

EXAMPLES
  @chancreate/lock Staff=flag(wizard)
  @chanset Public/lock=connected

SEE ALSO: +help staff/chanset, +help staff/create
