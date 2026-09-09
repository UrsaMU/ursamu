SEPT -- Garou society around a caern

  Per W20: a sept is the society that forms around a caern. The caern
  is the spiritual node (see +help caern); the sept tracks the Sept
  Alpha, packs, and named positions. Caern mechanical bonuses still
  apply in the bound room -- the sept is the social layer on top.

SYNTAX
  +sept                                Show your sept (auto-resolved).
  +sept/list                           List all septs.
  +sept/info <name>                    Show a sept.
  +sept/roster [<name>][=<opts>]       Full roster.
  +sept/create <name>                  (Staff) Found a sept.
  +sept/bind <sept>/<caern>            (Staff) Bind a caern to the sept.
  +sept/join <sept>                    (Pack Alpha) Bring your pack in.
  +sept/leave                          (Pack Alpha) Withdraw your pack.
  +sept/alpha <sept>=<player>          (Staff) Set the Sept Alpha.
  +sept/position <sept>/<plr>=<pos>    (Sept Alpha/Staff) Assign a role.
  +sept/unposition <sept>/<player>     (Sept Alpha/Staff) Clear a role.
  +sept/disband <name>                 (Staff) Destroy an empty sept.

ROSTER OPTS  (after =, comma-separated key:value)
  sort:name|rank|auspice|breed|position   default: rank desc
  auspice:<v>  breed:<v>  tribe:<v>       exact match
  pack:<v>                                exact match (filter only)
  position:<v>                            substring match

POSITIONS  (free text; canon examples)
  Master of the Rite, Master of the Howl, Talesinger, Caller of the
  Wyld, Truthcatcher, Warder, Den Mother / Den Father, Wyrm Foe.

SEE ALSO: +help caern, +help pack, +help wod20th
