combat delaying  -- Holding an action and reclaiming it with /act.

Use /delay when you want to wait and see what the rest of the order
does before committing your instant action.

Delay:
  +combat/delay marks you Delayed and skips your slot. The turn pointer
  jumps to the next combatant. You keep your held action.

Act:
  +combat/act takes the held action now. The turn pointer jumps to you
  and the rest of the order resumes after you finish. Delayed actors
  can interrupt the natural order.

Round wrap:
  All delayed flags clear automatically at the round wrap. If you
  never /act, the held action is lost when the round ends.

Edge cases:
  You cannot /delay if you have already acted this turn. /act is a
  no-op outside of an active encounter or if you are not Delayed.

See also: combat, combat order, combat action-economy
