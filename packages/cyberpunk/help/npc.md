+NPC

Spawn and manage street **NPCs** for FNFF combat. Staff build;
everyone can list and inspect. Walker AI runs on NPC turns.

SYNTAX
  +npc[/<switch>] [<args>]

SWITCHES
  /list                 NPCs in this room (default).
  /templates            Archetype catalog.
  /build <name>=<arch>  Spawn NPC here (staff).
  /show <name>          Full stat block.
  /ai <name>=<key>      Set AI brain (staff).
  /destroy <name>       Remove NPC (staff).

AI KEYS
  aggressive   Attack first foe (default).
  manual|off   ST controls the turn.
  llm|ai-gm    Optional AI-GM bridge.

EXAMPLES
  +npc/templates
  +npc/build Razor=boosterganger
  +init
  +pass

SEE ALSO: +help combat, +help attack
