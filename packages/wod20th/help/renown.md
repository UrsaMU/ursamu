RENOWN

  Werewolf renown tracks (Glory, Honor, Wisdom) and rank advancement.

SYNTAX
  +renown                                 Show your renown.
  +renown <target>                        (Staff) Show another's renown.
  +renown/award <target>=<track>:<N> [reason]   (Staff) Award renown.
  +renown/lose  <target>=<track>:<N> [reason]   (Staff) Remove renown.
  +renown/list                            Show rank threshold table.

SWITCHES
  /award   Add temporary renown. May trigger rank advance.
  /lose    Remove temporary renown (cannot go below zero).
  /list    Show the cumulative threshold required for each rank.

EXAMPLES
  +renown                          See your tracks and progress.
  +renown/award Alice=glory:2 brave deed
  +renown/lose  Bob=honor:1 oathbreaker
  +renown/list                     Show rank thresholds.

SEE ALSO: +help wod20th (overview)
