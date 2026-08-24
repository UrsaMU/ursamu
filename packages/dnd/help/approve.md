+APPROVE

Staff commands for D&D chargen review (admin+).

SYNTAX
  +approve <player>[=notes]
  +deny <player>=<reason>
  +unapprove <player>

NOTES
  Players +cg/submit open a CGEN job. +approve promotes the
  draft to a live sheet, sets approved, and closes the job.
  Closing the job via +job/close also auto-approves.
  +deny returns the draft for revision.

EXAMPLES
  +approve Alice
  +approve Bob=Looks solid
  +deny Carol=Fix STR score
  +unapprove Dave

SEE ALSO: +help staffkit, +help cg
