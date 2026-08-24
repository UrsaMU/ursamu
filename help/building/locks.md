---
hidden: true
---
+LOCKS

Locks are boolean **keys** checked when someone
tries to use an object or exit. Empty = pass.

TOPICS
  locks/keys       Atoms + operators
  locks/types      @lock switches
  locks/funcs      flag() holds() is() …
  locks/examples   Exit / room patterns
  @lock            Command syntax

OPERATORS
  `&` / `&&`  AND     `|` / `||`  OR
  `!`  NOT            `( )` group
  Adjacent atoms imply AND (space = `&`).

Channels use the same keys on `@chanset …/lock=`.
SEE ALSO: +help locks/keys, +help staff/locks
