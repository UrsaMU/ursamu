+CONDITION

Track D&D conditions, exhaustion, and concentration.

SYNTAX
  +condition [<player>]
  +condition/add <cond> [=player]
  +condition/remove <cond> [=player]
  +condition/clear [=player]
  +condition/exhaustion <0-6> [=player]
  +condition/list

NOTES
  Conditions modify attack and ability rolls in combat.
  Concentration breaks on a failed CON save after damage.

EXAMPLES
  +condition/add prone
  +condition/add poisoned=Orc
  +condition/exhaustion 2

SEE ALSO: +help inspiration, +help cast, +help combat
