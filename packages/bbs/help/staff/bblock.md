---
tags: [bblock]
dark: true
hidden: true
---
+BBLOCK

Set the read lock on a board. Staff only.

SYNTAX
  +bblock <#>=<lock>

  Locks: `all()` (open), `faction`
  (ownerId-based), empty (also open).

EXAMPLES
  +bblock 2=all()
  +bblock 2=faction

SEE ALSO: +help bbs/staff, +help bbwritelock
