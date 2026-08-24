+COMBAT

View or manage the combat tracker for this room.

The `->` marker shows who's up. `[acted]` and `[held]` tags
appear next to combatants who have already moved or are sitting
tight, waiting for their moment.

SYNTAX
  +combat[/switch]

SWITCHES
  /queue    Show initiative order (default).
  /log      Show the last 20 entries in the combat log.
  /end      End combat (initiator or admin only).
  /resist   Roll REF + Evasion vs active suppressive fire here.

EXAMPLES
  +combat/log          Show recent combat log.
  +combat/resist       Roll to evade suppressive fire.

SEE ALSO: +help combat/init, +help combat/pass, +help combat/suppress
