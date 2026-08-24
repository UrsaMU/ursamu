+HUMANITY

Track **Humanity Loss** and EMP.
EMP = empBase - floor(HL/10). EMP <= 0 risks cyberpsychosis.

SYNTAX
  +humanity[/switch] [<argument>]

SWITCHES
  (none) /view       Show HL, EMP, and risk.
  /gain <type>       Positive experience (cooldown).
  /set <target>=<n>  (Admin) Set HL.

TYPES
  `connection` `achievement` `kindness` `memory`

EXAMPLES
  +humanity                    View your humanity.
  +humanity/gain connection    Recover HL from a bond.

SEE ALSO: +help therapy, +help cyber
