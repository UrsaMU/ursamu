---
topic: "locks"
section: building
aliases: ["lock-keys", "locking"]
---
+LOCKS

Locks are boolean **keys** checked when someone tries to use an
object or exit. Empty lock = always pass.

TOPICS
  locks/keys       Atoms: me, #id, *Name, +flag, attr:val
  locks/types      @lock switches (basic, use, enter, …)
  locks/funcs      flag() holds() is() owner() perm()
  locks/examples   Exits, items, rooms, eval-style keys
  @lock            Command syntax

Operators: `&` / `&&` (and), `|` / `||` (or), `!` (not),
`( )` grouping. Adjacent atoms imply AND.

On fail: **FAIL** / **OFAIL** / **AFAIL** fire (see
action-attrs).

SEE ALSO: +help @lock, +help locks/examples
