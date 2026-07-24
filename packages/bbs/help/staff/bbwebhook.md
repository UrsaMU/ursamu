---
tags: [bbwebhook]
dark: true
hidden: true
---
+BBWEBHOOK

Set or clear a Discord webhook URL for a
board. Staff only. Must be public HTTPS
(internal IPs blocked).

SYNTAX
  +bbwebhook <#>=<url>

  Empty value clears the webhook.

EXAMPLES
  +bbwebhook 2=https://discord.com/api/...
  +bbwebhook 2=

SEE ALSO: +help bbs/staff
