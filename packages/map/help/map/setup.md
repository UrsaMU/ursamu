---
dark: true
---
See also: +help map (overview)

+MAP/SETUP

CREATE
  @create Scout
  @set Scout=map-capable enter_ok
  &CAPACITY Scout=4 · drop Scout

BOARD / FLY
  enter Scout · +map/launch · +map · +move n
  +map/land · leave

INTERIOR
  @open Out=Dock  (you control Scout)
  exits blocked while on the map grid

LOCKS
  enter_ok / @lock/enter · default deny

SEE ALSO: +help map, +help enter, +help rooms/open
