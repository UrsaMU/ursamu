+SHEET  -- View and edit Chronicles of Darkness sheets.

SYNTAX
  +sheet [<player>]                View (live or draft).
  +sheet/set <trait>=<value>       Edit your live sheet.
  +sheet/set <p>/<trait>=<v>       Builder+: edit other.
  +sheet/set specialty/<sk>=<n>    Add skill specialty.
  +sheet/virtue|vice|rest [p]      Willpower recovery.

VIEWING
  Self always works (draft during +cg). Others' drafts
  need canEdit. After +approve, live sheet is active.

EDITING
  Live sheet only via +sheet/set. Build with +cg until
  approved. Size / others' WP: builder+.

EXAMPLES
  +sheet
  +sheet/set strength=3
  +sheet/set mask=A quiet barista.

SEE ALSO: help sheet/traits, help sheet/willpower,
  help sheet/size, help sheet/specialties, help cg,
  help changeling
