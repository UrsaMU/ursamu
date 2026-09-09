HEAL

Heal damage from a character. Staff command.

SYNTAX
  +heal <target>=<amount><type>

PARAMETERS
  amount   Number of health levels to heal.
  type     B (bashing), L (lethal), or A (aggravated).

EXAMPLES
  +heal me=3B          Heal 3 bashing damage from yourself.
  +heal Bob=1L         Heal 1 lethal damage from Bob.
  +heal Alice=2A       Heal 2 aggravated damage from Alice.

NOTES
  Heals lowest-priority damage first when type is omitted.
  Aggravated damage typically heals slowly; staff use only.

SEE ALSO: +help hurt, +help sheet
