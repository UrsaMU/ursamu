+CHARGEN

Point-buy chargen for the Cinematic Unisystem RPG (BtVS/AFMBE
rules). Roll D10 + Attribute + Skill; 9+ succeeds.

SYNTAX
  +chargen/start               Begin (or restart) a draft.
  +chargen/type <slug>         whitehat, hero, or experienced.
  +chargen/submit              Submit for staff approval.
  +stat <name>=<level>         Attributes 1-6.
  +skill <slug>=<level>        Skills 0-10 (0 removes).
  +chargen/approve <player>    Staff: approve (admin+).
  +chargen/reject <player>=<n> Staff: return for revision.

EXAMPLES
  +chargen/start
  +chargen/type hero
  +stat dexterity=5
  +skill kung-fu=4
  +chargen/submit

SEE ALSO: +help rolls, +help drama
