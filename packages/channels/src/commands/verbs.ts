import { addCmd } from "@ursamu/mush";

export {
  execAddcom,
  execCboot,
  execCemit,
  execChancreate,
  execChandestroy,
  execChannel,
  execChanhistory,
  execChanset,
  execChantranscript,
  execCwho,
} from "./exec.ts";

import {
  execAddcom,
  execCboot,
  execCemit,
  execChancreate,
  execChandestroy,
  execChannel,
  execChanhistory,
  execChanset,
  execChantranscript,
  execCwho,
} from "./exec.ts";

addCmd({
  name: "@channel",
  pattern:
    /^@?(?:channels?|clist)(?:\/(join|leave|list|full|headers))?\s*(.*)?$/i,
  lock: "connected",
  category: "Channel",
  help: `@channel              — List available channels.
@channel/join <chan>=<alias>  — Join a channel with an alias.
@channel/leave <alias>        — Leave a channel.
@clist                        — List public channels and their owners.
@clist/full                   — List channels with detailed properties.
@clist/headers                — List channels with custom headers.

Aliases: @channels, @clist

Examples:
  @channel
  @channel/join Public=pub
  @clist/full`,
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

Output is sent directly to you as unformatted messages.
Aliases: +channel/transcript

Examples:
  @chantranscript Public=100
  @chantranscript Staff=50`,
  exec: execChantranscript,
});

addCmd({
  name: "@chancreate",
  pattern: /^@?(?:chancreate|ccreate)(?:\/(hidden|lock))?\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chancreate <name>[=<header>]         — Create a channel (admin+).
@chancreate/hidden <name>[=<header>]  — Create a hidden channel.
@chancreate/lock <name>=<lock>        — Create a channel with a lock.

Aliases: @ccreate

Examples:
  @chancreate Staff
  @ccreate/hidden Admin=[ADMIN]
  @ccreate/lock Guild=member+`,
  exec: execChancreate,
});

addCmd({
  name: "@chandestroy",
  pattern: /^@?(?:chandestroy|cdestroy)\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chandestroy <name>  — Destroy a channel and its history (admin+).

All subscribers are removed. This cannot be undone.
Aliases: @cdestroy

Examples:
  @chandestroy Staff
  @cdestroy temp-ooc`,
  exec: execChandestroy,
});

addCmd({
  name: "@chanset",
  pattern: /^@?(?:chanset|cset)\s+(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@chanset <name>/<property>=<value>  — Modify a channel property (admin+).

Properties: header, lock, hidden (on/off), masking (on/off), log (on/off),
historyLimit (<n>)
Aliases: @cset

Examples:
  @chanset public/header=[PUB]
  @cset public/lock=player+
  @cset public/hidden=on`,
  exec: execChanset,
});

addCmd({
  name: "@addcom",
  pattern:
    /^@?(?:addcom|delcom|allcom|clearcom|comtitle|comlist)(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Channel",
  help: `@addcom <alias>=<channel>     — Add a channel alias.
@delcom <alias>               — Remove a channel alias.
@allcom                       — List all your channel aliases.
@allcom <on|off|who>          — Toggle or list members of all channels.
@comlist                      — List all your channel aliases.
@clearcom                     — Remove all channel aliases.
@comtitle <alias>=<title>     — Set your title prefix on a channel.

Examples:
  @addcom pub=Public
  @delcom pub
  @allcom who
  @comtitle pub=Lord`,
  exec: execAddcom,
});

addCmd({
  name: "@cemit",
  pattern: /^@?cemit(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@cemit <channel>=<message>           — Broadcast message on a channel (admin+).
@cemit/noheader <channel>=<message>  — Broadcast without header prefix.

Examples:
  @cemit Public=The game will restart soon.
  @cemit/noheader Public=System notice.`,
  exec: execCemit,
});

addCmd({
  name: "@cboot",
  pattern: /^@?cboot(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@cboot <channel>=<object>        — Boot a player/object from a channel (admin+).
@cboot/quiet <channel>=<object>  — Boot without broadcasting notification.

Examples:
  @cboot Public=Player1
  @cboot/quiet Public=*Player1`,
  exec: execCboot,
});

addCmd({
  name: "@cwho",
  pattern: /^@?cwho(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Channel",
  help: `@cwho <channel>      — List connected/active players on a channel (admin+).
@cwho/all <channel>  — List all subscribed players and their active status.

Examples:
  @cwho Public
  @cwho/all Public`,
  exec: execCwho,
});
