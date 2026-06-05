import { addCmd } from "../commands/addCmd.ts";
import {
  execChannel,
  execChanhistory,
  execChantranscript,
  execChancreate,
  execChandestroy,
  execChanset,
  execAddcom,
} from "./channels-exec.ts";

export {
  execChannel,
  execChanhistory,
  execChantranscript,
  execChancreate,
  execChandestroy,
  execChanset,
  execAddcom,
};

addCmd({
  name: "@channel",
  pattern: /^@?channels?(?:\/(join|leave|list))?\s*(.*)?$/i,
  lock: "connected",
  category: "Channel",
  help: `@channel              — List available channels.
@channel/join <chan>=<alias>  — Join a channel with an alias.
@channel/leave <alias>        — Leave a channel.

Aliases: @channels

Examples:
  @channel
  @channel/join Public=pub
  @channel/leave pub`,
  exec: execChannel,
});

addCmd({
  name: "@chanhistory",
  pattern: /^(?:@chanhistory|\+channel\/history)\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chanhistory <name>[=<lines>]  — Show recent channel history.

Aliases: +channel/history

Examples:
  @chanhistory Public
  @chanhistory Public=50`,
  exec: execChanhistory,
});

addCmd({
  name: "@chantranscript",
  pattern: /^(?:@chantranscript|\+channel\/transcript)\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chantranscript <name>=<lines>  — Export channel history as plain text.

Output is sent directly to you as unformatted messages, suitable for
copy-pasting. Aliases: +channel/transcript

Examples:
  @chantranscript Public=100
  @chantranscript Staff=50`,
  exec: execChantranscript,
});

addCmd({
  name: "@chancreate",
  pattern: /^@?chancreate(?:\/(hidden|lock))?\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chancreate <name>[=<header>]         — Create a channel (admin+).
@chancreate/hidden <name>[=<header>]  — Create a hidden channel.
@chancreate/lock <name>=<lock>        — Create a channel with a lock.

Examples:
  @chancreate Staff
  @chancreate/hidden Admin=[ADMIN]
  @chancreate/lock Guild=member+`,
  exec: execChancreate,
});

addCmd({
  name: "@chandestroy",
  pattern: /^@?chandestroy\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chandestroy <name>  — Destroy a channel and its history (admin+).

All subscribers are removed. This cannot be undone.

Examples:
  @chandestroy Staff
  @chandestroy temp-ooc`,
  exec: execChandestroy,
});

addCmd({
  name: "@chanset",
  pattern: /^@?chanset\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chanset <name>/<property>=<value>  — Modify a channel property (admin+).

Properties: header, lock, hidden (on/off), masking (on/off), log (on/off),
historyLimit (<n>)

Examples:
  @chanset public/header=[PUB]
  @chanset public/lock=player+
  @chanset public/hidden=on`,
  exec: execChanset,
});

addCmd({
  name: "@addcom",
  pattern: /^@?(?:addcom|delcom|allcom|clearcom|comtitle)(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Channel",
  help: `@addcom <alias>=<channel>     — Add a channel alias (join if needed).
@delcom <alias>               — Remove a channel alias.
@allcom                       — List all your channel aliases.
@clearcom                     — Remove all channel aliases.
@comtitle <alias>=<title>     — Set your title prefix on a channel.

Examples:
  @addcom pub=Public
  @delcom pub
  @comtitle pub=Lord`,
  exec: execAddcom,
});
