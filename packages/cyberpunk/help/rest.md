+REST

Timed downtime recovery. One rest at a time.

SYNTAX
  +rest[/switch] [short|long]

SWITCHES
  /start [short|long]  Begin rest (default short = 8h, 2d6 HP).
  /status              Collect healing when timer done.
  /cancel              Abort with no healing.

  Long rest = 24h, full HP.

EXAMPLES
  +rest/start long     Begin a long rest.
  +rest/status         Collect healing when ready.

SEE ALSO: +help heal, +help pharma/stim
