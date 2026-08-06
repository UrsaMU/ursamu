---
dark: true
---
See also: +help cg (overview)

+CG/WIPE  -- Staff: full character bit wipe.

SYNTAX
  +cg/wipe <player>[=<reason>]

PERMISSIONS
  Connected staff (admin / wizard / storyteller+).

CLEARS
  Live sheet (data.cofd)
  Chargen draft (data.cofd_cg) then seeds fresh draft
  approved flag
  Sight flags fae and forsaken
  Comments open CGEN job if present

NOTES
  Reason required when wiping another player.
  Player is notified in-game and by @mail.
  Self wipe: +cg/reset (no reason needed).

EXAMPLES
  +cg/wipe Alice=Requested full rebuild
  +cg/wipe #12=ST retcon after chronicle break

SEE ALSO: +help cg, +help approve, +help deny
