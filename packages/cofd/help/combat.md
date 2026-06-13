+combat  -- Manage a combat encounter: open, join, begin, advance turns,
            and close. All players in the scene share one encounter.

CORE SYNTAX
  +combat/start              Open a new encounter.
  +combat/join               Join the current encounter.
  +combat/leave              Leave without ending the encounter.
  +combat/begin              Roll initiative and set turn order.
  +combat/order              Show the initiative table.
  +combat/next [/manual]     Advance turn (manual = no AI walker).
  +combat/end                Close the encounter and clear state.
  +combat/status [<player>]  Show a participant's combat state.

For ambush, cover, conceal, delay, move, run, and reflexive switches,
see help combat/switches.

SEE ALSO: help combat/switches, help combat/initiative,
          help combat/order, help combat/action-economy,
          help combat/modifiers, help combat/specified,
          help attack, help grapple, help dodge
