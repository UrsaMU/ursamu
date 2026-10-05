+condition  -- View or modify Conditions and Tilts. Resolving a Condition
              awards Beats; removing it (correction) awards nothing.

SYNTAX
  +condition                                 View your Conditions.
  +condition <player>                        View another's.
  +condition/add <key> [for <player>]        Apply by catalog key.
  +condition/add <key>/<note> [for <player>] Apply with a note.
  +condition/remove <key> [for <player>]     Remove (no Beats).
  +condition/resolve <key> [for <player>]    Resolve + award Beats.
  +condition/list                            Show the catalog.

Modifying another player requires canEdit (builder+).

EXAMPLES
  +condition/add shaken
  +condition/add shaken/Saw the body
  +condition/resolve shaken
  +condition/list

SEE ALSO: help condition/tilts, help aspiration, help beat, help xp
