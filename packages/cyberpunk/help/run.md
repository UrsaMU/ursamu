+RUN

AI-GM **mission runner** — one command starts a full run for
everyone in the room. Pose to play; combat uses +init/+attack.

SYNTAX
  +run[/<switch>] [<args>]

SWITCHES
  (none)             Status of the active run.
  /list              Browse mission packs.
  /start [id|random] Start with crew in this room.
  /complete          Finish + split payout (objectives done).
  /abort             Bail (no pay).
  /advance           (Staff) Next phase.
  /objective <id>    (Staff) Mark objective done.

EXAMPLES
  +run/list
  +run/start random
  +run/start maelstrom-smash
  +run
  +run/complete

SEE ALSO: +help gig, +help combat, +help npc, +help netrun
