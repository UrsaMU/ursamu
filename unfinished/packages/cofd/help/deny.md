---
dark: true
---
+DENY  -- Return a chargen draft for revision.

SYNTAX
  +deny <player>=<reason>

PERMISSIONS
  Connected + admin+. Reason required.

WORKFLOW
  1. +sheet <player>           Review the draft.
  2. +deny <player>=<reason>  Send it back.

MECHANICS
  Keeps the +cg draft. Clears the submitted marker
  so the player can edit and +cg/submit again
  (same open CGEN job). Posts a public comment on
  that job; does not close it. Player gets a live
  message and @mail. Live sheet is not changed.

SEE ALSO: help approve, help sheet, help cg, help deny/examples