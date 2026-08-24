---
dark: true
---
See also: +help staff (overview)

+LOCKS

One **lock** string on a channel. Checked when a
player **joins** (login / addcom) and when they
**speak**. Empty lock = anyone may use it.

SYNTAX
  @chancreate/lock <name>=<key>
  @chanset <name>/lock=<key>
  @chanset <name>/lock=          clear (open)

NOTES
  Same key language as object locks (`+help locks`).
  `hidden=on` hides from lists; lock still applies.
  Fail-closed: bad/unknown funcs deny access.

SEE ALSO: +help staff/locks/keys,
+help staff/locks/examples, +help locks
