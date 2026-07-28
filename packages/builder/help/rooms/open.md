See also: +help rooms (overview)

+OPEN

  Create an exit from your current room (or inventory with
  /inventory). Lock: builder+.

SYNTAX
  @open <name>=<destination>
  @open <name>=<destination>,<back>
  @open/inventory <name>=<destination>

  Destination is a room. Optional back exit is created on
  the far side pointing here.

EXAMPLES
  @open North;N=#12
  @open East;E=Library,West;W

SEE ALSO: +help rooms/dig, +help rooms/link
