---
tags: [bbreply]
---
+BBREPLY

Reply to an existing BBS post.

SYNTAX
  +bbreply[/ic|/ooc] <#>/<post>[=<text>]

  With `=<text>`: quick-reply in one line.
  Without body: open a reply draft; use +bb
  to write, +bbpost to submit.

SWITCHES
  /ic     Tag reply as In-Character.
  /ooc    Tag reply as Out-of-Character.

EXAMPLES
  +bbreply 2/3=Great post!
  +bbreply/ic 2/3

SEE ALSO: +help bbs/posting, +help bbpost
