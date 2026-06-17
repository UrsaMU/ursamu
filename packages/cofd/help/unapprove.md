+unapprove  -- Return a pending Chronicles of Darkness submission for revision.

Syntax:
  +unapprove <player>=<reason>   Return the submission with a required reason.

Permissions:
  Run            connected + admin+.
  Target         any player with a CGEN job in 'new' or 'open' status.

Mechanics:
  Reopens the player's CGEN job (status 'open') with a staff comment
  carrying the reason, and clears the submittedJob marker so the player
  can edit their chargen workspace and resubmit. The live sheet is not
  touched. The chargen state itself is preserved.

  A reason is required. Returns without a reason are refused.

Examples:
  +unapprove Alice=Concept needs more detail; please flesh out the backstory.
  +unapprove Bob=Attribute totals are off by one. Recheck the priority array.

See also: approve, cg, sheet
