---
tags: [bbtimeout]
dark: true
hidden: true
---
+BBTIMEOUT

Set post expiry in days. Staff only. Zero
means no timeout. Requires autotimeout on
for automatic cleanup.

SYNTAX
  +bbtimeout <#>/<post>=<days>

EXAMPLES
  +bbtimeout 2/3=30    Expire in 30 days.
  +bbtimeout 2/3=0     Remove timeout.

SEE ALSO: +help bbs/staff, +help bbconfig
