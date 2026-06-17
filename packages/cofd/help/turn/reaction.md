+turn/reaction  -- Set a reaction posture for the coming round.

Syntax:
  +turn/reaction <posture> [target=<name>]

Postures:
  ambush                       Strike from concealment. Consumed by Azlu-
                               class AI when they reveal themselves.
  overwatch                    Stand ready to fire on movement. Stored
                               (Pass 3 will consume on movement triggers).
  guard                        Brace to defend an ally or area. Stored.
  first-fire-on-adjacent       Trigger fire when an adjacent enemy moves
                               or attacks. Stored.

Mechanics:
  Pass 2 wires only the storage and AI consumption for ambush. Overwatch,
  guard, and first-fire-on-adjacent persist on the participant slot and
  will be consumed by Pass 3 trigger logic.

Examples:
  +turn/reaction ambush                    Take ambush posture.
  +turn/reaction overwatch                 Overwatch the room.
  +turn/reaction guard target=Lia          Guard a specific ally.
  +turn/reaction first-fire-on-adjacent    Set the trigger.

See also: turn, combat, attack
