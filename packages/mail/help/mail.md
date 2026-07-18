+MAIL

In-game mail — compose drafts, read inbox/trash, reply, forward.

SYNTAX
  @mail                         List inbox
  @mail <n>                     Read message number `n`
  @mail <player>=<subject>      Start a draft
  -<text>                       Append a line to the draft
  @mail/send                    Send the current draft
  @mail/abort                   Discard the draft

SWITCHES
  /proof     Preview draft before send
  /subject   Set draft subject
  /cc /bcc   Add recipients
  /reply     Reply to message `n`
  /forward   Forward `n`=`target`
  /trash     List trash (or delete `n`)
  /restore   Restore trash message `n`
  /purge     Permanently delete trash
  /save      Protect message from delete

SEE ALSO: +help mail/compose, +help mail/rest
