---
tags: [bbconfig]
dark: true
hidden: true
---
+BBCONFIG

View or set global BBS config. Staff only.

SYNTAX
  +bbconfig [<setting>=<value>]

  Settings: `timeout` (days),
  `autotimeout` (on/off).

EXAMPLES
  +bbconfig
  +bbconfig timeout=30
  +bbconfig autotimeout=on

SEE ALSO: +help bbs/staff, +help bbtimeout
