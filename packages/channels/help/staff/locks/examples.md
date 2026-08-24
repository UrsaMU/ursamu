---
dark: true
---
See also: +help staff/locks (overview)

+LOCKS/EXAMPLES

PUBLIC
  @chanset Public/lock=connected
  @chanset Public/lock=connected&!guest

STAFF
  @chanset Staff/lock=connected admin+
  @chanset Wiz/lock=wizard|admin|superuser
  @ccreate/lock Admin=connected staff+

ALLOWLIST
  @chanset Plot/lock=*Alice|*Bob|#42
  @chanset Fac/lock=attr(tribe,red)

  Prefer `admin+`. Test with a non-staff alt.
  Clear: `@chanset Name/lock=`

SEE ALSO: +help staff/locks/keys, +help staff/chanset
