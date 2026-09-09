INIT -- Combat initiative for the room

  M20: each fighter rolls Dex + Wits + 1d10 (not exploded). Highest
  goes first. Ties: Dex, then Wits, then random. Modifiers cover
  armor (-1 to -3), readied firearm (+1 to +3), etc. State is held
  on the room, so all combatants see the same order.

SYNTAX
  +init [<mod>]        Roll and join the order.
  +init/show           Show the order; ">" marks the current turn.
  +init/next           Advance to the next turn.
  +init/reroll [<mod>] Drop and re-roll yourself.
  +init/drop           Leave combat (remove yourself).
  +init/clear          Staff: end combat in this room.

EXAMPLES
  +init                Roll Dex + Wits + d10.
  +init 2              Add +2 (readied firearm).
  +init/show           See whose turn it is.
  +init/next           Pass the turn forward.

See also: +help wod20th (overview), +help attack
