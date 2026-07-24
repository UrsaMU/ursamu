---
tags: [bbwritelock]
dark: true
hidden: true
---
+BBWRITELOCK

Set the write lock on a board. Staff only.
Controls who may post; not who may read.

SYNTAX
  +bbwritelock <#>=<lock>

  Same lock values as +bblock.

EXAMPLES
  +bbwritelock 2=all()
  +bbwritelock 2=faction

SEE ALSO: +help bbs/staff, +help bblock
