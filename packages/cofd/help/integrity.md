+integrity  -- View Integrity, trigger Breaking Points, or adjust track.

SYNTAX
  +integrity                                  View your track.
  +integrity <player>                         View another's.
  +integrity/break <reason> [+/-N]            Self-trigger.
  +integrity/break <p>=<reason> [+/-N]        ST for another.
  +integrity/set <0-10> [for <player>]        Staff: set rating.

/break rolls Resolve + Composure to resist. /set adjusts without a
roll. Modify others requires canEdit (builder+).

Roll pool: Resolve + Composure + rating-mod + situational (cap +/-5).

EXAMPLES
  +integrity/break Saw a ghost -1
  +integrity/break Killed in self-defense -4
  +integrity/set 5 for Marcus

SEE ALSO: help integrity/rating-mod, help integrity/situations,
          help integrity/outcomes, help integrity/anchors,
          help condition, help virtues, help vices
