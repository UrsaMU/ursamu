+combat  -- Manage a combat encounter: open, join, begin, advance turns,
            and close. All players in the scene share one encounter.

CORE SYNTAX
  +combat/start              Open a new encounter.
  +combat/join               Join the current encounter.
  +combat/leave              Leave without ending the encounter.
  +combat/begin              Roll initiative and set turn order.
  +combat/order              Show the initiative table.
  +combat/next [/manual]     Advance turn. Default: NPC AI runs until the
                             next PC. /manual = one slot, no AI.
  +combat/end                Close the encounter and clear state.
  +combat/status [<player>]  Show a participant's combat state.
NPC AI is automatic after PC attacks and on /next. Opt out per NPC with
+npc/ai <name>=manual (or off/none) so the ST plays that slot.

SEE ALSO: help attack, help grapple, help dodge, help throw, help gear, help reload, help npc, help turn, help zone, help combat/switches, help combat/initiative, help combat/order, help combat/action-economy, help combat/modifiers, help combat/specified, help combat/examples
