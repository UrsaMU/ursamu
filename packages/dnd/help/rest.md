+REST

Recover hit points and resources with a short or long rest.

SYNTAX
  +rest/short [<dice>]
  +rest/long

SWITCHES
  /short  Spend N Hit Dice (default 1); each die + Con heals
  /long   Full HP, half HD (min 1), restore slots, clear death

NOTES
  Blocked while dying or dead. Stabilize or heal first.
  Stable creatures at 0 HP may take a short rest.

EXAMPLES
  +rest/short
  +rest/short 2
  +rest/long

SEE ALSO: +help hp, +help deathsave
