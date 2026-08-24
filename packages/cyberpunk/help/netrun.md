+NETRUN

Jack into **NET** architectures (Netrunner). Actions = INT/2.

SYNTAX
  +netrun[/switch] [<argument>]

SWITCHES
  /jack <name>                Enter an architecture.
  /jack_out                   Disconnect.
  /status                     Floor, DV, actions left.
  /action <ability> [vs <DV>] Use Interface ability.
  /programs                   Loaded programs.
  /endturn                    Reset action budget.
  /build <name> <floors> <DV> (Admin) Create arch.

EXAMPLES
  +netrun/jack Arasaka_Tower      Jack in.
  +netrun/action backdoor vs 18   Breach a password.

SEE ALSO: +help combat, +help role
