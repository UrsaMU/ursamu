+DELCOM

  Remove a channel alias from your subscription list.

SYNTAX
  delcom <alias>

  The alias is case-sensitive. After removing it you will no longer
  receive messages on that channel. The channel itself is unchanged.

  If the channel is later re-created you must use **addcom** again
  to rejoin with a new alias.

EXAMPLES
  delcom pub
  delcom Staff

SEE ALSO: +help addcom, +help comlist, +help clearcom
