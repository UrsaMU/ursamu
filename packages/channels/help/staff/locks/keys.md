---
dark: true
---
See also: +help staff/locks (overview)

+LOCKS/KEYS

Atoms for **channel** locks (player joining/speaking).

FLAGS / RANK
  connected          logged in (usual baseline)
  player  guest      type flags
  builder+ staff+    that rank **or higher**
  admin+ wizard      exact; `+` means ≥ ladder

OTHER
  *Alice  #12        named player / dbref
  flag(x) perm(x)    funcs
  attr(k) attr(k,v)  state present / equals

OPS
  `&`=`&&` AND  `|`=`||` OR  `!` NOT
  Space between atoms also means AND.

SEE ALSO: +help staff/locks/examples, +help locks
