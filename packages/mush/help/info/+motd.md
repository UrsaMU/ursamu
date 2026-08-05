+MOTD

Multi-entry Message of the Day (general + wizard scopes).

SYNTAX
  +motd
  +motd/set <general|wizard>=<text>
  +motd/del <general|wizard>=<n>
  +motd/list
  +motd/reset <general|wizard>

General is public; wizard is staff-only. Set/del/reset
require admin+. Distinct from @motd (single login text).

EXAMPLES
  +motd
  +motd/set general=Reboot Sunday 02:00 UTC
  +motd/del general=1

SEE ALSO: @motd, +uptime
