ATTACK -- Basic combat resolution

  Resolve a single attack against a target in your room. Rolls attack,
  damage, and soak, then applies any net damage to the target's track.

SYNTAX
  +attack[/switch] <target>

SWITCHES
  (none)     Brawl ability, Bashing damage. No weapon required.
  /melee     Melee ability, Lethal damage. Requires a wielded melee
             weapon (see +wield). Weapon's damage/damageType/silver
             flag propagate into the roll.
  /firearms  Firearms ability, Lethal damage. Requires a wielded
             firearm. Falls back to +2 bonus dice if the weapon does
             not declare its own damage.
  /claws     Brawl + 1 die. Intrinsic -- no weapon needed. Lethal in
             Crinos/Hispo, Bashing otherwise.

EXAMPLES
  +attack Bran              Basic brawl strike against Bran.
  +wield sword              Ready a melee weapon...
  +attack/melee Bran        ...then swing it for lethal damage.
  +attack/claws Bran        Garou claw strike (no weapon needed).
  +attack/firearms Bran     Firearms attack (requires wielded gun).

SEE ALSO: +help wod20th, +help hurt, +help sheet, +help rolling
