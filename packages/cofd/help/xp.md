+XP  -- View Experience, spend XP, list costs.

SYNTAX
  +xp                               View your pools.
  +xp <player>                      View another.
  +xp/spend <trait>=<dots>          Raise a trait.
  +xp/spend <trait>=<n> for <p>     Spend on other.
  +xp/list                          Cost table.

SWITCHES
  /spend   Cumulative cost current→target dots.
  /list    Print Standard vs Arcane costs.

PERMISSIONS
  Self: connected. Other: canEdit (builder+).

EXAMPLES
  +xp
  +xp/spend strength=3
  +xp/spend vigor=2 for Marcus
  +xp/list

SEE ALSO: help xp/costs, help beat, help sheet
