+MAP / +MOVE

Procedural sector map with vehicles, links, and spectate.

SYNTAX
  +map[/<switch>] [<args>]
  +move <dir>

SWITCHES
  /here                 Render sector around your active entity (default).
  /jump <x> <y> [z]     Admin: move active entity to coord.
  /embark <target>      Board a map-capable vehicle in this room.
  /disembark            Step out of a vehicle you are inside.
  /launch               Take your vehicle onto the map.
  /land                 Return your in-map vehicle to its dock.
  /link <entityId>      Builder+: pilot an entity remotely.
  /unlink               Stop remote piloting.
  /spectate <entityId>  Admin: watch an entity's vision.
  /unspectate           Admin: stop spectating.
  /stats                Builder+: dump system stats.

DIRECTIONS: n s e w ne nw se sw u d (long forms ok)
