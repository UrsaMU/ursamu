+ZONE  -- Staff regions with themed wandering NPCs.

SYNTAX
  +zone/list
  +zone/show <name>
  +zone/create <name>
  +zone/add <name>=<roomId> [...]
  +zone/from-exits <name>
  +zone/populate <name>=...
  +zone/theme|flavor|respawn|migration|wander ...
  +zone/destroy <name>

QUICK START
  +zone/create deepwood
  +zone/from-exits deepwood
  +zone/theme deepwood=forest
  +zone/populate deepwood=theme=forest size=large
  +zone/wander deepwood=on

SEE ALSO: help zone/switches, help zone/aggro, help npc
