REGEN

Garou damage regeneration. WtA characters knit Bashing wounds shut at
one box per turn, and Lethal at the same rate -- except when the damage
came from silver, fire, or supernatural teeth and claws.

SYNTAX
  +regen [<count>]            Heal N (default 1) Bashing on self.
  +regen/lethal [<count>]     Heal N (default 1) Lethal on self.
  +regen/full <target>        Staff: fully heal B+L on target.
  +regen/tick <target>        Staff: apply per-splat default regen.

EXAMPLES
  +regen                      Shake off 1 Bashing wound.
  +regen 3                    Shake off 3 Bashing wounds.
  +regen/lethal               Knit 1 Lethal wound shut.
  +regen/full Bran            Staff: fully heal Bran.

NOTES
  Aggravated damage never auto-regenerates. Kinfolk and mortals
  receive "You don't heal that quickly." -- use staff +regen/full.

SEE ALSO: +help hurt, +help heal, +help sheet
