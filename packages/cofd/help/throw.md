+throw  -- Throw a grenade (AoE) or aerodynamic weapon at a target.

SYNTAX
  +throw <item-key>                Throw a grenade (encounter AoE).
  +throw <item-key> at <target>    Throw an aerodynamic weapon at one.
  +throw/<switch> <item-key>       Stackable switches.

SWITCHES
  /fratricide        Include the thrower in the blast.
  /wp                Spend 1 Willpower for +3 dice.
  /into-melee[=<n>]  -n dice to avoid hitting bystanders.

EXAMPLES
  +throw grenade-frag               Frag the room.
  +throw grenade-stun               Flashbang every participant.
  +throw shuriken at Marcus         Throw at Marcus.
  +throw/wp grenade-frag            Spend 1 WP and throw.

For grenade resolution math, blast vs Stamina, Tilts applied, and ammo
behavior, see throw/mechanics.

SEE ALSO: help throw/mechanics, help attack, help combat, help gear
