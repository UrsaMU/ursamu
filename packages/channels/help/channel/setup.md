---
dark: true
---
See also: +help channel (overview)

+CHANNEL/SETUP

  Configure channel behavior with @chanset (admin only).

SYNTAX
  @chanset <channel>/<property>=<value>

PROPERTIES
  `header`        Prefix prepended to every channel message.
  `lock`          Lock expression required to access the channel.
  `hidden`        Hide from @clist (`on`/`off`).
  `masking`       Allow player monikers/masks (`on`/`off`).
  `log`           Enable history logging (`on`/`off`).
  `historyLimit`  Maximum history lines to retain (1–5000).

EXAMPLES
  @chanset Public/header=[PUB]
  @chanset Staff/hidden=on
  @chanset Public/historyLimit=500

SEE ALSO: +help chancreate, +help channel/locks
