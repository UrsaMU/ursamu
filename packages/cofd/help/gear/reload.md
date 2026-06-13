gear/reload  -- Reload an equipped or carried firearm from an ammo stack.

See also: help gear (overview).

SYNTAX
  +gear/reload                      Reload equipped firearm.
  +gear/reload <#|name> [for <p>]   Slot # or substring name.

MECHANICS
  Picks first ammo stack whose forWeaponKeys includes the weapon's key.
  Decrements by 1, refills currentClip to catalog clip. Stack at count=1
  is destroyed.
  No compatible stack? Fails: "No magazine for <weapon> in inventory."
  <#|name>: int = 1-based slot; else case-insensitive substring.
  For-other = canEdit (builder+).

EXAMPLES
  +gear/reload rifle
  +gear/reload 2 for Marcus

SEE ALSO: help gear, help gear/ammo, help attack, help reload
