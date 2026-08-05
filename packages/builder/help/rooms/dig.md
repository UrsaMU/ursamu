See also: +help rooms (overview)

+DIG

  Create a room. Optionally create exits to and from it.
  Costs quota (staff exempt). Lock: builder+.

SYNTAX
  @dig <room>
  @dig <room>=<exit>
  @dig <room>=<exit>,<back>
  @dig/teleport <room>[=...]

SWITCHES
  /teleport  Move into the new room after create.

EXAMPLES
  @dig Library
  @dig Market=North;N,South;S
  @dig/teleport Storage

SEE ALSO: +help rooms/open, +help objects/quota
