+BENCH

Open a **Tech** repair workshop in the current room.

SYNTAX
  +bench[/switch] [<argument>]

SWITCHES
  /open [name]     Open a bench (8h unless you own room).
  /close           Close your active bench.
  /rates <t>=<n>   Set rate (`weapon`/`armor` eb/SP, `gear` flat).
  /queue           Pending jobs (Tech).
  /collect         Pick up a finished repair.

EXAMPLES
  +bench/open Nomad Garage    Open a named bench.
  +bench/rates weapon=75      Set weapon rate to 75 eb/SP.
  +bench/collect              Collect finished work.

SEE ALSO: +help repair, +help role
