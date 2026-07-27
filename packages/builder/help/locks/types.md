---
topic: "locks/types"
section: locks
dark: true
---
+LOCKS/TYPES

See also: +help locks (overview)

@lock/<type> stores a named key. Default type is **basic**.

  basic   Get / take item; walk exit
  use     @use / USE on the object
  enter   Enter a container or room
  leave   Leave a container or room
  drop    Drop this object
  give    Give something *to* this object
  page    Page the locked player
  link    @link / building link rights
  speech  Speak in room (if enforced)
  tell    Whisper / tell (if enforced)

EXAMPLES
  @lock chest=me
  @lock/use crystal=flag(wizard)
  @lock/enter club=+member
  @unlock/use crystal

SEE ALSO: +help @lock, +help locks/examples
