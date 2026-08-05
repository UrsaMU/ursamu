---
dark: true
---
See also: +help staff (overview)

+CBOOT

  Remove a player or object from a channel (owner or admin+).

SYNTAX
  @cboot <channel>=<object>
  @cboot/quiet <channel>=<object>

SWITCHES
  /quiet  No channel notification.

  Prefix the target with `*` to match by name globally
  (example: `*Alice`).

EXAMPLES
  @cboot Public=Alice
  @cboot/quiet Public=*Alice

SEE ALSO: +help staff/cwho, +help staff
