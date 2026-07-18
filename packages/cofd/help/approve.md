+APPROVE  -- Approve a pending chargen submission.

SYNTAX
  +approve <player>
  +approve <player>=<notes>

PERMISSIONS
  Connected + admin+. Target CGEN job new or open.

MECHANICS
  Copies sheet live, clears chargen, closes job.
  Syncs sight flags: changeling → `fae`,
  werewolf → `forsaken`.

EXAMPLES
  +approve Alice
  +approve Alice=Welcome. Watch your touchstones.

SEE ALSO: help unapprove, help cg, help perception,
  help changeling
