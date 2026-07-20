---
dark: true
---
See also: help turn (overview)

+turn/reaction  -- Set a reaction posture for the coming round.

SYNTAX
  +turn/reaction <posture> [target=<name>]

Postures:
  ambush                       Strike from concealment. Consumed by Azlu-
                               class AI when they reveal themselves.
  overwatch                    Stand ready to fire on movement. Stored
                               (Pass 3 will consume on movement triggers).
  guard                        Brace to defend an ally or area. Stored.
  first-fire-on-adjacent       Trigger fire when an adjacent enemy moves
                               or attacks. Stored.

MECHANICS
  Pass 2 wires only the storage and AI consumption for ambush. Overwatch,
  guard, and first-fire-on-adjacent persist on the participant slot and
  will be consumed by Pass 3 trigger logic.

SEE ALSO: turn, combat, attack, help turn/reaction-examples