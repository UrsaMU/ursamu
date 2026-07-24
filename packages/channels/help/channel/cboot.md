---
dark: true
---
See also: +help channel (overview)

+CBOOT

  Forcefully removes a player or object from a channel.
  Only the channel owner or staff can use this command.

SYNTAX
  @cboot[/quiet] <channel>=<object>

SWITCHES
  /quiet  Boots without broadcasting notification to the channel.

  Prefix <object> with `*` to target by name without being in the same
  room (e.g. `*Player1`).

EXAMPLES
  @cboot Public=Player1
  @cboot/quiet Public=*Player1

SEE ALSO: +help channel, @cwho
