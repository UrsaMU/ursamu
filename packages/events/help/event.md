+EVENT

In-game event calendar with RSVP tracking.

SYNTAX
  +event[/<switch>] [<args>]
  +events

PLAYER SWITCHES
  /list                 List events (default).
  /view <#>             Details and RSVP roster.
  /rsvp <#>[=status]    RSVP: attending (default), maybe, decline.
  /unrsvp <#>           Cancel your RSVP.

STAFF SWITCHES
  /create <title>=<YYYY-MM-DD[ HH:MM]>/<description>
  /edit <#>/<field>=<value>
  /status <#>=<upcoming|active|completed|cancelled>
  /cancel <#>
  /delete <#>

EDIT FIELDS
  title, description, location, starttime, endtime, maxattendees, tags

EXAMPLES
  +event
  +event/view 3
  +event/rsvp 3=maybe
  +event/create Gala=2027-08-01 19:00/Annual summer gathering.

SEE ALSO: +help events
