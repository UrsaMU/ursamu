+UNAPPROVE  -- Return a pending chargen submission.

SYNTAX
  +unapprove <player>=<reason>

PERMISSIONS
  Connected + admin+. Reason required.

MECHANICS
  Reopens CGEN job with staff comment; clears submit
  marker so the player can edit +cg and resubmit.
  Live approved sheet is not changed.

EXAMPLES
  +unapprove Alice=Concept needs more detail.
  +unapprove Bob=Attribute totals are off by one.

SEE ALSO: help approve, help cg, help sheet
