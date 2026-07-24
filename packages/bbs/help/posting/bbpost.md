---
tags: [bbpost]
---
+BBPOST

Post a new message to a BBS board.

SYNTAX
  +bbpost[/ic|/ooc] [<#>/<subject>[=<body>]]

  `<#>/<subj>=<body>`: quick-post one line.
  `<#>/<subj>` only: open a multi-line draft.
  No args with draft open: submit the draft.

SWITCHES
  /ic     Tag post as In-Character.
  /ooc    Tag post as Out-of-Character.

EXAMPLES
  +bbpost 2/Big News=The war is over.
  +bbpost/ic 2/Scene Recap
  +bbpost

SEE ALSO: +help bbs/posting, +help bb
