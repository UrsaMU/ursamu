LITANY -- The Thirteen Laws of the Garou

  The Litany binds the People (W20 pp.25-26). Garou file charges
  against breaches; staff sustains or dismisses. Upheld charges cost
  the accused renown; dismissed charges tax the accuser.

SYNTAX
  +litany                          List the 13 laws.
  +litany/list                     Same as above.
  +litany/info <law-slug>          Full text + penalty.
  +litany/charge <target>=<slug>/<reason>
                                   File an accusation.
  +litany/pending [<target>]       Open charges (default: self).
  +litany/uphold <id>              (Staff) Sustain; apply penalty.
  +litany/dismiss <id>             (Staff) Reject; -0.5 Honor accuser.
  +litany/withdraw <id>            (Accuser) Withdraw before resolution.

GATES
  WtA splat, Rank 1+, not frenzied, target not self, reason 10+ chars.
  Duplicate (accuser, target, law) while pending is rejected.

EXAMPLES
  +litany/info law-9
  +litany/charge Cassidy=law-9/Shifted Crinos before mortals at the bar.
  +litany/uphold 0a1b2c3d

SEE ALSO: +help renown, +help sept, +help pack
