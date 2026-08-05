See also: +help rooms (overview)

+OPEN

  Create an exit from your **current location** — a room, or
  any enterable object you control (vehicle cabin, booth).

SYNTAX
  @open <name>=<destination>
  @open <name>=<destination>,<back>
  @open/inventory <name>=<destination>

  Destination may be a room or object dbref/name. Optional
  back exit is created on the far side pointing here.

VEHICLES
  enter Scout · @open Out=Dock
  (exits blocked while the vehicle is on the map grid)

EXAMPLES
  @open North;N=#12
  @open Out=Dock Bay
  @open East;E=Library,West;W

SEE ALSO: +help rooms/dig, +help enter, +help map/setup
