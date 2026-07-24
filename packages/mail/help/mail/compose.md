---
dark: true
---
See also: +help mail (overview)

+MAIL/COMPOSE

Draft workflow for **@mail**.

SYNTAX
  @mail <player>=<subject>
  -<line>
  @mail/subject <text>
  @mail/cc <player>
  @mail/bcc <player>
  @mail/attach <object>
  @mail/proof
  @mail/send
  @mail/abort

EXAMPLES
  @mail Alice=Hello
  -First line of the body.
  -Second line.
  @mail/send

NOTES
  Drafts live on the player under `state.mail.draft`.
  Inbox quota is 100 messages per player.

SEE ALSO: +help mail
