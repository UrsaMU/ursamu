+approve  -- Approve a pending Chronicles of Darkness chargen submission.

Syntax:
  +approve <player>             Approve with no notes.
  +approve <player>=<notes>     Approve and attach a staff note.

Permissions:
  Run            connected + admin+.
  Target         any player with a CGEN job in 'new' or 'open' status.

Mechanics:
  Copies the player's submitted sheet onto the live character record,
  clears their chargen workspace, and closes the CGEN job as 'closed'
  with a staff comment. The player is notified inline.

  If the CGEN job is missing or already in a terminal status (closed,
  cancelled, resolved), the approval is refused so nothing is silently
  overwritten.

Examples:
  +approve Alice
  +approve Alice=Welcome to the chronicle. Watch your touchstones.

See also: unapprove, cg, sheet
