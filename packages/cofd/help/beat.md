+beat  -- Award, subtract, or view Beats. Five Beats convert to one
          Experience the moment the fifth is logged. Arcane Beats track
          separately at the same 5:1 ratio.

Syntax:
  +beat                                      View your own pools.
  +beat <player>                             View another player's pools.
  +beat/add [<player>] [= <reason>]          Award 1 Beat (default self).
  +beat/sub [<player>] [= <reason>]          Subtract 1 Beat (correction).
  +beat/add/arcane [<player>] [= <reason>]   Award 1 Arcane Beat.
  +beat/sub/arcane [<player>] [= <reason>]   Subtract 1 Arcane Beat.

Switches:
  /add        Award one Beat to the target (default self).
  /sub        Subtract one Beat. Never goes below zero; will pull from
              Experience if needed.
  /arcane     Operate on the Arcane track instead of the standard one.
              Combine with /add or /sub, e.g. +beat/add/arcane.

Permissions:
  View                connected.
  Award / sub self    connected.
  Award / sub other   connected + canEdit (builder+).

Examples:
  +beat                            View your own pools.
  +beat add                        Award yourself 1 Beat.
  +beat add = Resolved Inspired    Award 1 Beat with a logged reason.
  +beat add Marcus = Took a risk   Award Marcus 1 Beat (builder+).
  +beat add/arcane = Frenzy        Award yourself 1 Arcane Beat.
  +beat sub Marcus                 Subtract 1 Beat from Marcus.

See also: xp, sheet, cofd
