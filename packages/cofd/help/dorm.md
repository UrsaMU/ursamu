---
dark: true
---
+DORM / FREEHOLD HOME

Approved PCs can be given a freehold bunk. Type **home** to
return there anytime.

CONFIG (staff / config.json)
  plugins.cofd.dorms.changeling = "56"
  plugins.cofd.ctlDorm = "56"   (legacy alias)

BEHAVIOR
  +approve   Sets home for that template's dorm (if any)
             and moves the player there.
  +staffkit  Same for staff test kits.
  home       Teleports you to data.home.

COURT
  Rose Dorm (#56) — CtL bunks behind the Briar stores.

SEE ALSO: +help approve, +help staffkit, home, @link
