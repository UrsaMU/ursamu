---
dark: true
---
See also: +help staff (overview)

+CHANSET

  Change channel properties (admin+ or owner).
  Alias: `@cset`.

SYNTAX
  @chanset <channel>/<property>=<value>

PROPERTIES
  `header` `lock` `hidden` `masking` `log`
  `historyLimit` (1-5000)  `announce`
  `lock` = join + speak. Empty opens channel.

EXAMPLES
  @chanset Public/header=[PUB]
  @chanset Staff/lock=connected admin+
  @chanset Staff/hidden=on

SEE ALSO: +help staff/locks, +help staff/create
