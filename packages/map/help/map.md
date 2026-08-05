+MAP

Procedural sector map. Vehicles are normal objects: **enter**,
**launch**, then **+map** / **look** / **+move**.

SYNTAX
  +map[/<switch>] [<args>]
  +move <dir>
  enter <vehicle> · leave

QUICK START
  @create Scout · @set Scout=map-capable enter_ok
  drop Scout · enter Scout · +map/launch · +map

NOTES
  map-capable = may launch onto the grid
  enter uses object locks (enter_ok / @lock/enter)

SEE ALSO: +help map/setup, +help map/switches,
  +help map/builder, +help enter
