---
dark: true
---
See also: +help staff (overview)

+CHANSET

  Change channel properties (admin+). Alias: @cset.

SYNTAX
  @chanset <channel>/<property>=<value>

PROPERTIES
  `header` `lock` `hidden` `masking` `log`
  `historyLimit` (1-5000)  `announce` (in-game only)

EXAMPLES
  @chanset Public/header=[PUB]
  @chanset Public/announce=on
  @chanset Staff/hidden=on

SEE ALSO: +help staff/create, +help staff/locks
