---
dark: true
---
SEE ALSO: help gear (overview)

+GEAR DURABILITY  -- Structure, soak, broken state.

VALUES
  Durability: flat soak. Structure: current hp.
  Applied dmg = max(0, raw − Durability).
  Structure 0 → broken; force-unequip + room notice.

COMMANDS
  +gear/damage <ref>[=n]   Apply raw damage.
  +gear/repair <ref>[=n]   Heal structure (canEdit).
  +attack <item>           Smash objects in room.

EXAMPLES
  +gear/damage rifle=4
  +gear/repair vest=2

SEE ALSO: help gear, help attack
