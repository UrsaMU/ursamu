FETISH -- Spirit-bound items

  A fetish is a tool or weapon (kind=fetish) inhabited by a spirit.
  Activating one binds the spirit's power; you spend Gnosis equal to the
  item's state.fetishCost (default 1). A TALEN (@eq/talen item=true) is
  a single-use fetish; it is consumed on activation and cannot be
  released. Only Garou and Kinfolk may use either; both are frenzy-gated.

SYNTAX
  +fetish                       List fetishes you are carrying.
  +fetish/list                  Same as +fetish.
  +fetish/info <item>           Show fetish details and current state.
  +fetish/use <item>            Activate; pays Gnosis.
  +fetish/deactivate <item>     Release the bound spirit.

EXAMPLES
  +fetish                       List your fetishes.
  +fetish/use klaive            Bind a fetish klaive (-fetishCost Gnosis).
  +fetish/use bane-arrow        Spend a talen; item is consumed.
  +fetish/deactivate klaive     Release it.

SEE ALSO: +help gnosis, +help frenzy, +help eq, +help wod20th
