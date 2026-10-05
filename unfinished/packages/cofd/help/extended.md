+extended  -- Manage CoFD 2e Extended Actions (core p.70).

Extended Actions accumulate successes across many rolls until a target
is hit or attempts run out. Use for research, lockpicking, crafting,
ritual workings, or any task that takes time.

CORE SYNTAX
  +extended                  Status of your active action.
  +extended/start <expr>     Open a new action. See extended/syntax.
  +extended/roll [<mod>]     Roll the next attempt.
  +extended/status [<id>]    View an action by id.
  +extended/list [scope]     mine | here | all (staff for all).
  +extended/abandon <id>     Cancel an action.
  +extended/finish <id>      Staff: force success.
  +extended/contest <a>+<b>  Staff: link two contested actions.

SEE ALSO: help extended/syntax, help extended/pool,
          help extended/cumulative, help extended/contested,
          help extended/intervals, help roll
