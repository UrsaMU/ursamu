CHALLENGES

Formal Garou contests -- staredowns, words, single combat, klaive duels,
death duels. The initiator names the type and the reason; the target
accepts or declines. Victors gain temp renown; cowards lose it.

SYNTAX
  +challenge                         List types + your open challenges.
  +challenge/info <type-slug>        Show one type in detail.
  +challenge/issue <target>=<type>/<reason>
  +challenge/accept <id>             Target accepts.
  +challenge/decline <id>            Target declines (-renown).
  +challenge/resolve <id>            Resolve an accepted challenge.
  +challenge/withdraw <id>           Initiator backs out.
  +challenge/consent <id>            Sept leader OK's a death-duel.

EXAMPLES
  +challenge/issue Bran=staredown/You spoke ill of my pack.
  +challenge/accept a1b2c3d4
  +challenge/resolve a1b2c3d4

SEE ALSO: +help challenge-combat, +help sept, +help renown
