---
dark: true
---
+APPROVE  -- Promote a chargen draft to a live sheet.

SYNTAX
  +approve <player>
  +approve <player>=<notes>

PERMISSIONS
  Connected + admin+.

WORKFLOW
  1. +sheet <player>      Review the draft.
  2. +approve <player>   Make it live.

MECHANICS
  Copies chargen draft to the live sheet, clears
  +cg, syncs sight flags (changeling → `fae`,
  werewolf → `forsaken`). Completes the open CGEN
  job (archives it like +job/close). Player gets a
  live message and @mail.

SEE ALSO: help deny, help sheet, help cg,, help approve/examples