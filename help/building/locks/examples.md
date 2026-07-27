---
topic: "locks/examples"
section: locks
dark: true
---
+LOCKS/EXAMPLES

See also: +help locks (overview)

EXITS
  @lock north=me
  @lock vault=wizard | #2
  @lock portal=+member & !dark
  @fail north=The way is barred.
  @ofail north=rattles the gate.

ITEMS
  @lock sword=me
  @lock/use wand=flag(wizard)
  @lock gem=holds(#9) | me

ROOMS / ENTER
  @lock/enter club=+member
  @lock/enter office=is(#2) | perm(admin)

INDIRECT / EVAL-STYLE
  @lock junior=@#10
    (must pass #10's basic lock)
  @lock shop=[gt(money(%#),50)]

SEE ALSO: +help @lock, +help locks/keys,
+help action-attrs
