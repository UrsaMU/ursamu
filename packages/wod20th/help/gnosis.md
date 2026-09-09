GNOSIS -- Werewolf temporary pool

  View and spend Gnosis points. Gnosis fuels gift activations, stepping
  sideways into the Umbra, and most rite rolls. Current Gnosis cannot
  exceed your permanent rating (max 10) or fall below 0.

SYNTAX
  +gnosis                  Show current/permanent Gnosis.
  +gnosis/spend <n>        Spend <n> points of Gnosis.
  +gnosis/regain <n>       Regain <n> points; capped at permanent.
  +gnosis/set <n> <tgt>    Staff only: set permanent Gnosis rating.

SWITCHES
  /spend     Decrement current Gnosis by <n>. Blocked while frenzied.
  /regain    Increment current Gnosis by <n>, capped at permanent.
  /set       Staff override; logs to character stat history.

EXAMPLES
  +gnosis              Display "Gnosis: 3/6".
  +gnosis/spend 1      Spend one Gnosis to step sideways.
  +gnosis/regain 1     Regain one Gnosis after meditation.

See also: +help wod20th (overview), +help rage
