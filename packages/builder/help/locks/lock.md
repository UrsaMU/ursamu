See also: +help locks (overview)

+LOCK

  Set or clear locks on an object or exit you can edit.

SYNTAX
  @lock <target>=<key>
  @lock/<type> <target>=<key>
  @lock <target>=

  Clear with an empty key. Types select which lock slot
  (basic, use, enter, and others the engine supports).

EXAMPLES
  @lock North=me
  @lock/use Chest=member+
  @lock East=

SEE ALSO: +help locks/keys, +help locks/types
