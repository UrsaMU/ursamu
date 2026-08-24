+PHARMA

**Medtech** field synthesis of street drugs.

SYNTAX
  +pharma[/switch] [<name or id>]

SWITCHES
  /list          Synthesizable drugs and DVs.
  /queue         Active synthesis projects.
  /synth <name>  Begin synthesis (pays materials).
  /check <id>    Collect when ready.

EXAMPLES
  +pharma/list
  +pharma/synth speedheal
  +pharma/check abc123ef

SEE ALSO: +help pharma/drug, +help pharma/stim
