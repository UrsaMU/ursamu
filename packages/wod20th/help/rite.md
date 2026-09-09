RITES -- Werewolf rites

  Garou ceremonies. Each rite has a level (1-5), category, and difficulty
  (default 7). Casting rolls Gnosis against difficulty.

SYNTAX
  +rite                       List rites your character knows.
  +rite/list [<category>]     List all rites; optional category filter.
  +rite/info <slug>           Show details for a single rite.
  +rite/learn <slug>          Add a rite to your known list.
  +rite/cast <slug>           Cast a known rite (Gnosis roll).
  +rite/teach <target>=<slug> (Staff) Teach a target a rite.
  +rite/forget <slug>         (Staff) Remove a rite from yourself.

SWITCHES
  /list      Categories: mystic, minor, seasonal, accord, caern,
             death, renown, punishment, passage.
  /cast      Spends Gnosis and rolls vs the rite's difficulty.
             Blocked while frenzied (see +help frenzy).

EXAMPLES
  +rite/list mystic
  +rite/info rite-of-cleansing
  +rite/learn rite-of-passage
  +rite/cast rite-of-cleansing

SEE ALSO: +help wod20th, +help rolling
