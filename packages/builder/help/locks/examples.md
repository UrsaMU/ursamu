See also: +help locks (overview)

+EXAMPLES

  Common patterns.

EXITS
  @lock North=me
  @lock Vault=flag(wizard)|*Guard

ITEMS
  @lock/use Keycard=me|*Owner
  @lock Chest=holds(#99)

ROOMS
  @lock/enter Club=member+

  Prefer simple keys. Test with a non-owner alt.

SEE ALSO: +help locks/lock, +help rooms/open
