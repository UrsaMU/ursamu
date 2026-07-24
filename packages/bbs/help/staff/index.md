+BBS/STAFF

Staff administration commands for board setup and locks.

COMMANDS
  +bbnewgroup <title>=<cat> — Create a new board.
  +bbcleargroup <#>         — Mark a board for deletion.
  +bbconfirm <#>            — Confirm board deletion.
  +bblock <#>=<lock>        — Set read access lock.
  +bbwritelock <#>=<lock>   — Set post access lock.
  +bbtimeout <#>/<post>=<d> — Set post expiry in days.
  +bbcategory <#>=<cat>     — Display category.
  +bbwebhook <#>=<url>      — Discord webhook URL.
  +bbconfig [<set>=<val>]   — Global BBS settings.

SEE ALSO: +help bbs (overview)
