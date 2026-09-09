+ROLL

  Roll a WoD20th dice pool against a difficulty.

SYNTAX
  +roll <pool> [vs <diff>]          Roll a numeric or trait pool.
  +roll <trait>[+<trait>] [vs <diff>]   Roll combined traits.
  +roll/spec <pool> [vs <diff>]     Roll with specialty (10s re-roll).

  Default difficulty is 6. Each die >= difficulty is a success.
  A 1 cancels a success. With /spec, 10s explode (re-roll and add).

  When you roll a trait pool, the worst current wound penalty is
  deducted from your pool and shown in the label as "(wound -N)".
  If the deduction reduces your pool to zero, the roll is aborted.

EXAMPLES
  +roll 5                   Roll 5 dice at difficulty 6.
  +roll 5 vs 7              Roll 5 dice at difficulty 7.
  +roll Strength+Brawl      Roll Strength + Brawl pool.
  +roll/spec Dexterity      Roll Dexterity with specialty.

SEE ALSO: +help rolling, +help sheet, +help wod20th
