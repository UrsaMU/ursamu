+aspiration  -- View or modify Aspirations. Up to three at once.
               Fulfilling one awards 1 Beat.

SYNTAX
  +aspiration                              View your list.
  +aspiration <player>                     View another's.
  +aspiration/add <text> [for <p>]         Add short-term.
  +aspiration/add/long <text> [for <p>]    Add long-term.
  +aspiration/remove <#> [for <p>]         Remove (no Beat).
  +aspiration/fulfill <#> [for <p>]        Fulfill + 1 Beat.

Modifying another requires canEdit (builder+).
Beats convert at 5:1 to Experience (see +xp).

DISPLAY TAGS
  [S]  Short-term.   [L]  Long-term.

EXAMPLES
  +aspiration/add Win Marco's trust
  +aspiration/add/long Avenge my sister

SEE ALSO: help condition, help beat, help xp, help sheet
