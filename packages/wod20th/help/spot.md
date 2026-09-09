SPOT

Active Perception + Awareness check for concealed gear.

SYNTAX
  +spot
  +spot <target>

DETAILS
  With no target, scans everyone in the room. With a target, checks
  just that character. Pool is Perception + Awareness (case-insensitive,
  0 if absent), minus wound penalty. Each concealed item rolls once
  against its concealability:

    Pocket(P)      diff 8
    Jacket(J)      diff 7
    Trenchcoat(T)  diff 6
    Not(N)         auto-spot

  One or more successes finds the item.

EXAMPLES
  +spot           Scan the room.
  +spot alice     Scan Alice specifically.

SEE ALSO: +help conceal, +help wod20th
