---
dark: true
---
See also: +help channel (overview)

+CHANNEL/LOCKS

  Restrict channel access using lock expressions (admin only).

SYNTAX
  @chancreate/lock <channel>=<lock>
  @chanset <channel>/lock=<lock>

  The lock value is a standard UrsaMU lock expression. Players must
  pass the lock to join or speak on the channel.

EXAMPLES
  @chancreate/lock Staff=flag(wizard)
  @chanset Public/lock=connected

SEE ALSO: +help chancreate, +help channel/setup
