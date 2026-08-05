---
dark: true
---
See also: +help map (overview)

+MAP/BUILDER

VEHICLE
  @set <thing>=map-capable enter_ok
  optional &CAPACITY / &MAPCAPACITY

OVERLAYS
  +map/authorize 10 20=infrastructure:#:Bunker
  +map/clear 10 20 · glyph one char; no [ ]

OPS
  +map/stats · +map/prune (orphans + stranded)
  Staff UI: /admin/map when web is loaded

THEME
  plugins.map.theme = hedge | court | default

SEE ALSO: +help map, +help map/setup
