+turn  -- Per-actor turn helpers built on the smart AI walker.

Syntax:
  +turn/done                       Alias for +combat/next (smart walker).
  +turn/auto [<max-rounds>]        Builder+: pump until PC turn / all NPCs
                                   down / cap. Default 10, hard cap 50.
  +turn/reaction <posture> [target=<name>]
                                   Set your reaction posture for next round.

Switches:
  /done       End your turn; AI takes over until next PC turn or scene end.
  /auto       Builder+: drive the encounter forward in batches.
  /reaction   Declare a reaction posture (ambush, overwatch, guard,
              first-fire-on-adjacent). See help turn reaction.

Permissions:
  /done       connected, must be in the encounter.
  /auto       connected + builder/admin/wizard.
  /reaction   connected, must be in the encounter.

Examples:
  +turn/done                       End your turn; AI takes over.
  +turn/auto                       Builder: pump up to 10 rounds.
  +turn/auto 3                     Builder: pump up to 3 rounds.
  +turn/reaction ambush            Set ambush posture.
  +turn/reaction overwatch target=Marcus
                                   Overwatch keyed to Marcus.

More:
  help turn reaction               Posture types and consumption rules.

See also: combat, attack, npc
