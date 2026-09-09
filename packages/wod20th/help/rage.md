RAGE -- Werewolf temporary pool

  View and spend Rage points. Rage powers extra actions, frenzy, and
  many Garou rites. Current Rage cannot exceed your permanent rating
  (max 10) and cannot fall below 0.

SYNTAX
  +rage                  Show current/permanent Rage.
  +rage/spend <n>        Spend <n> points of Rage.
  +rage/regain <n>       Regain <n> points; capped at permanent.
  +rage/set <n> <tgt>    Staff only: set permanent Rage rating.

SWITCHES
  /spend     Decrement current Rage by <n>.
  /regain    Increment current Rage by <n>, capped at permanent.
  /set       Staff override; logs to character stat history.

EXAMPLES
  +rage              Display "Rage: 4/7".
  +rage/spend 1      Spend one Rage for an extra action.
  +rage/regain 2     Regain two Rage after taking damage.

See also: +help wod20th (overview), +help gnosis
