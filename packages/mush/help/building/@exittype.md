@EXITTYPE

Set or clear the TYPE attribute on an exit.

SYNTAX
  @exittype <exit>=[<value>]

Look groups exits by TYPE. Empty value clears TYPE.
Equivalent to: &type <exit>=<value>
Requires builder+ and canEdit on the exit.

EXAMPLES
  @exittype north=direction
  @exittype Inn=tavern
  @exittype north=

SEE ALSO: look, @open
