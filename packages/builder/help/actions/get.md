See also: +help actions (overview)

+GET

  Hooks around picking up or receiving objects. Exact attr
  names follow the installed action set (e.g. GET, GIVE,
  RECEIVE variants).

NOTES
  Use locks for who may take an object. Action code should
  not replace permission checks.

EXAMPLES
  @examine Widget
  @lock Widget=me

SEE ALSO: +help actions/move, +help locks
