+grapple  -- Initiate or continue a grapple. On the first use, roll to
             grab an opponent. On subsequent turns, both combatants
             contest for control and the winner picks a grapple move.

Syntax:
  +grapple <target>                    Initial grab attempt.
  +grapple/<move> [<target>]           Declare your move this turn.

Initial grab:
  Pool: Strength + Brawl - target Defense.
  On any success: both characters are grappling.
  On exceptional success: immediately pick one move from the list below.

Contested control (each subsequent turn):
  Both characters roll Strength + Brawl on the higher of the two
  Initiatives. The winner picks one move. An exceptional success
  earns two moves.

Permissions:
  connected; must be a participant in an active encounter.

Examples:
  +grapple Marcus                  Attempt to grab Marcus.
  +grapple/hold                    Win control: apply Hold move.
  +grapple/damage                  Deal bashing damage.
  +grapple/restrain                Immobilize Marcus (requires Hold).
  +grapple/break-free              Escape the grapple.
  +grapple/take-cover              Use Marcus as a shield.

More:
  help grapple moves        Full list of grapple moves and effects.
  help grapple firearms     Shooting into a grapple.

See also: combat, attack, dodge, health, condition
