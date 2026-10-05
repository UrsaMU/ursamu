---
aliases: ["view", "+view", "+views", "views"]
---
+VIEW / +VIEWS

Detail views on a place (like **+notes** for rooms). Locks use normal
lock logic. Look shows `< +views Available >` when any are visible.

SYNTAX
  +views                   List views you can see here.
  +views <name>            Read one view.
  +views/add <name>=<text> Create (needs canEdit).
  +views/edit <name>=text  Replace text.
  +views/del <name>        Delete.
  +views/lock <name>=lock  Set lock; `!` clears.

LIST  Names only. Leading **+** = locked (legend under footer).

EXAMPLES
  +views/add Angel=Wings weep verdigris.
  +views/lock Angel=flag(approved)
  +views Angel

SEE ALSO: +help notes
