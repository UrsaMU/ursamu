---
dark: true
---
+CHANSET

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
  `announce`      Connect/disconnect/join/leave lines (`on`/`off`).
                  In-game only — never mirrored to Discord.

EXAMPLES
  @chanset Public/header=[PUB]
  @chanset Public/announce=on
  @chanset Staff/hidden=on

SEE ALSO: +help chancreate, +help channel/setup
