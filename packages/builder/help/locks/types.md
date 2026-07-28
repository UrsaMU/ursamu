See also: +help locks (overview)

+TYPES

  Different lock slots control different actions.

COMMON
  (default)   Basic control / default use
  use         Using the object
  enter       Entering a vehicle/room object
  page        Who may page (players)
  teleports   Who may teleport to

  Exact list depends on engine version. Use @lock/type
  when the type is supported.

EXAMPLES
  @lock/use Door=me|*Guard
  @lock/enter Car=me

SEE ALSO: +help locks/lock, +help locks/keys
