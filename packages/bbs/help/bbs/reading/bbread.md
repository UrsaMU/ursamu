---
tags: [bbread]
---
+BBREAD

Read boards, post indexes, or individual posts.

SYNTAX
  +bbread [<#>[/<posts>]]

  No args: board index by category.
  `<#>`: list posts. `<#>/<N>`: read post N.
  `<#>/<N>*`: post and all replies.
  `<#>/<N.R>`: reply R. `<#>/u`: unread.
  `<#>/1-5`: range of posts.

EXAMPLES
  +bbread             Show all boards.
  +bbread 2           List posts on board 2.
  +bbread 2/3         Read post 3 on board 2.
  +bbread 2/3*        Read post 3 and replies.
  +bbread 2/u         Read all unread on board 2.

SEE ALSO: +help bbs/reading
