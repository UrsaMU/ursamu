+GEAR

Weapons and armor catalog with base damage, protection, minting.

SYNTAX
  +gear / +gear/armor          Catalogs (weapons / armor).
  +gear/info <slug>            Weapon or armor details.
  +gear/wield|wear <slug>      Set your weapon / armor.
  +gear/give <player>=<slug>   Mint object into inventory (admin+).

NOTES
  Resolution order: base damage + Success Levels, minus Armor Value,
  then type multiplier (Bash x1, Slash/stab x2, Bullet x2).
  Melee uses Getting Medieval; firearms use Gun Fu.
  Minted objects carry &key=value stats, e.g. &dmg=4xStrength,
  &type=Slash/stab, &bash=8 &slash=8 &bullet=4 &coverage=Torso.

EXAMPLES
  +gear/info axe
  +gear/give Riley=bulletproof-vest

SEE ALSO: +help rolls
