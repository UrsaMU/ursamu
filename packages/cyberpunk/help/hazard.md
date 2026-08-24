+HAZARD

Environmental damage. Ref/admin only. Bypasses SP.

SYNTAX
  +hazard/<switch> <target> [<args>]

SWITCHES
  /fire <target>         3 HP fire (per round).
  /extinguish <target>   Clear on-fire flag.
  /drown <target>        Drowning damage.
  /fall <target> <m>     1d6 per 2m (min 1d6).
  /electro <t> [light|heavy]  1d6 or 2d6.

EXAMPLES
  +hazard/fire Rogue           Apply fire damage.
  +hazard/fall Rogue 10        10m fall damage.

SEE ALSO: +help wound, +help combat
