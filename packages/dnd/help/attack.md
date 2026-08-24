+ATTACK

Attack a foe. Starts combat automatically if needed.

SYNTAX
  +attack [<target>]

TARGET
  Partial names, ordinals, or #id:
    +attack gob
    +attack 2.goblin
    +attack #142
  No arg → your focus (last target).

NOTES
  No active fight? +attack starts one, then strikes
  if it is still your turn after initiative.
  Monsters at 0 HP auto-finish (XP + corpse).

EXAMPLES
  +attack goblin
  +attack
  +attack 2.wolf

SEE ALSO: +help focus, +help combat, +help kill
