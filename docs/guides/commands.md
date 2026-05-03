---
layout: layout.vto
title: Command Reference
description: Complete reference for all built-in UrsaMU in-game commands — player, channel, mail, bulletin boards, building, and admin.
---

# Command Reference

All built-in commands available in UrsaMU. Commands marked **admin+** require the `admin` or `wizard` flag. Commands marked **builder+** require `builder` or above.
---

## Player Commands

| Command | Description |
|---------|-------------|
| `look` / `l` | Look at your surroundings or a named object |
| `say <msg>` / `"<msg>` | Speak to everyone in the room |
| `pose <action>` / `:<action>` | Emote an action |
| `;` | Pose without a space (possessive — `Alice;'s phone rings`) |
| `think <msg>` | Private message visible only to you |
| `page <player>=<msg>` | Send a private message to any online player |
| `page <player>=:<pose>` | Page with a pose (`From afar, Alice waves.`) |
| `who` | List currently connected players |
| `@doing <text>` | Set your status message shown in `who` |
| `@away [<text>]` | Set or clear an away message shown when paged |
| `@last [<player>]` | Show last login/logout timestamps |
| `inventory` / `i` | List items you are carrying |
| `score` | View your character stats |
| `get <object>` | Pick up an object |
| `drop <object>` | Drop an object |
| `give <object>=<player>` | Give an object to another player |
| `home` | Return to your home location |
| `@teleport <destination>` | Teleport to a location or object (builder+) |
| `examine <object>` / `ex` | Inspect an object in detail |
| `@desc <object>=<text>` | Set an object's description |
| `@name <object>=<name>` | Rename an object |
| `whisper <player>=<msg>` | Private in-room message; others see attribution only |
| `quit` | Disconnect from the server |
| `help [<topic>]` | Display help text (provided by [help-plugin](https://github.com/UrsaMU/help-plugin)) |
---

## Channel Commands

Channels are provided by the [channel-plugin](https://github.com/UrsaMU/channel-plugin).
Players join channels and get a short alias to speak with.

| Command | Description |
|---------|-------------|
| `@channel/list` | List all available channels |
| `@channel/join <name>=<alias>` | Join a channel and assign a local alias |
| `@channel/leave <alias>` | Leave a channel by alias |
| `<alias> <message>` | Send a message on that channel |
| `<alias> :<pose>` | Pose on the channel |
| `<alias> on` | Re-activate a channel you temporarily left |
| `<alias> off` | Temporarily stop receiving a channel |
| `@addcom <alias>=<channel>` | Add a channel alias (TinyMUX-style) |
| `@delcom <alias>` | Remove a channel alias |
| `@allcom` | List all your channel aliases |
| `@clearcom` | Remove all your channel aliases |
| `@comtitle <alias>=<title>` | Set a display title prefix for a channel |
---

## Mail Commands

Mail is provided by the [mail-plugin](https://github.com/UrsaMU/mail-plugin).

| Command | Description |
|---------|-------------|
| `@mail` | Show your inbox |
| `@mail/send <to>=<subject>/<body>` | Send a mail message |
| `@mail/read <num>` | Read a message (marks as read) |
| `@mail/reply <num>=<body>` | Reply to a message |
| `@mail/replyall <num>=<body>` | Reply to all recipients |
| `@mail/forward <num>=<to>` | Forward a message |
| `@mail/cc <addr>` | Add a CC recipient while composing |
| `@mail/bcc <addr>` | Add a BCC recipient while composing |
| `@mail/subject <text>` | Set subject while composing |
| `@mail/proof` | Preview the message being composed |
| `@mail/abort` | Discard the message being composed |
| `@mail/delete <num>` | Delete a message |
---

## Bulletin Board Commands

Bulletin boards are provided by the [bbs-plugin](https://github.com/UrsaMU/bbs-plugin).

| Command | Description |
|---------|-------------|
| `+bblist` | List all bulletin boards with post and unread counts |
| `+bbread <board>` | List posts on a board |
| `+bbread <board>/<num>` | Read a specific post |
| `+bbpost <board>=<subject>/<body>` | Post to a board |
| `+bbpost/edit <board>/<num>=<body>` | Edit your own post |
| `+bbpost/delete <board>/<num>` | Delete your own post |
---

## Building Commands

Building commands are provided by the [builder-plugin](https://github.com/UrsaMU/builder-plugin). Requires `builder+` flag unless noted.

| Command | Description |
|---------|-------------|
| `@dig <name>` | Create a new room |
| `@create <name>` | Create a new object |
| `@open <exit>=<dest>` | Create an exit to another room |
| `@link <object>=<dest>` | Link an exit or set home/dropto |
| `@unlink <object>` | Remove a link from an object |
| `@clone <object>` | Clone an existing object |
| `@destroy <object>` | Destroy an object |
| `@alias <object>=<alias>` | Set an alias on an object |
| `@parent <object>=<parent>` | Set an object's parent |
| `@parent/clear <object>` | Clear an object's parent |
| `@lock <object>=<expr>` | Set a lock expression on an object |
| `@unlock <object>` | Remove a lock from an object |
| `@set <object>=<flag>` | Set a flag on an object |
| `@set <object>=<attr>:<value>` | Set an attribute on an object |
| `&<ATTR> <object>=<value>` | Shorthand attribute assignment |
| `@wipe <object>` | Remove all attributes from an object |
| `@trigger <object>/<attr>` | Execute a stored script attribute |
| `@nameformat <object>=<format>` | Custom name format |
| `@descformat <object>=<format>` | Custom description format |
| `@conformat <object>=<format>` | Custom contents format |
| `@exitformat <object>=<format>` | Custom exits format |
| `@decompile[/tf] <object>` | Dump object as copyable `@name`/`&ATTR` lines |
| `@find [<name>]` | Search objects by name or flag |
| `@quota` | Show your object creation quota |
---

## Admin Commands

Requires `admin` or `wizard` flag unless noted.

| Command | Description |
|---------|-------------|
| `@boot <player>` | Disconnect a player |
| `@toad <player>` | Convert a player to an object |
| `@newpassword <player>=<pass>` | Reset a player's password |
| `@chown <object>=<player>` | Transfer ownership of an object |
| `@moniker <object>=<name>` | Set an alternate display name |
| `@emit <message>` | Attributed room-wide message |
| `@remit <message>` | Unattributed room-wide message |
| `@pemit <player>=<message>` | Send directly to a player |
| `@cemit <channel>=<message>` | Unattributed channel broadcast |
| `@fsay <object>=<message>` | Force-speak as an owned object |
| `@fpose <object>=<action>` | Force-pose as an owned object |
| `@femit <object>=<message>` | Force-emit as an owned object |
| `@npemit <player>=<message>` | Send to a player with no prefix |
| `@motd` | Show the message of the day |
| `@motd/set <text>` | Set the message of the day |
| `@motd/clear` | Clear the message of the day |
| `@stats [/full]` | Show server statistics |
| `@search [<flags>]` | Search objects server-wide |
| `@quota <player>=<num>` | Set a player's object quota |
| `@sweep` | Remove all non-player objects from a room |
| `@entrances [<object>]` | List all objects that link to an object |
| `@halt [<player>]` | Cancel queued actions (own or target's if admin) |
| `@switch[/first] <val>=<case>,<cmd>,...` | Case-branch command execution |
| `@dolist <list>=<action>` | Iterate a space-delimited list; execute action per item (`##` = item, `#@` = index) |
| `@if <expr>=<true>[,<false>]` | Conditional execution |
| `@while <expr>=<action>` | Loop while expression is true |
| `@break` | Exit the current `@dolist` or `@while` loop |
| `@wait <seconds>=<action>` | Delay an action by N seconds |
| `@assert <condition>` | Abort trigger chain if condition is false |
| `@zone <object>=<zone master>` | Assign an object to a zone master |
| `@zone <object>=` | Clear zone assignment |
| `@function <name>=<obj>/<attr>` | Define a global softcode user function |
| `@cpattr <src>/<attr>=<dst>[/<newname>]` | Copy an attribute to another object |
| `@mvattr <src>/<attr>=<dst>[/<newname>]` | Move an attribute to another object |
| `@grep <obj>=<pattern>` | Search object attributes by name pattern |
| `@ps` | List all pending `@wait` jobs |
| `@drain <obj>` | Cancel all pending `@wait` jobs on an object |
| `@notify <obj>[/<sem>][=<count>]` | Signal a semaphore (`@wait/until`) |
| `@reboot` | Restart the server |
| `@shutdown` | Shut down the server |
| `@site <key>=<value>` | Set a server configuration value |
| `@resettoken <player>` | Generate a password-reset token for a player |
| `@chancreate <name>[=<header>]` | Create a channel |
| `@chandestroy <name>` | Destroy a channel |
| `@chanset <name>/<prop>=<value>` | Configure a channel |
| `+bbcreate <name>[=<description>]` | Create a bulletin board |
| `+bbdestroy <board>` | Destroy a bulletin board |
---

## Plugin Commands

Commands provided by official plugins are documented in their respective repos.

| Plugin | Commands | Docs |
|--------|----------|------|
| **jobs** | `+job`, `+jobs`, `+job/create`, etc. | [UrsaMU/jobs-plugin](https://github.com/UrsaMU/jobs-plugin#commands) |
| **events** | `+event`, `+events` | [UrsaMU/events-plugin](https://github.com/UrsaMU/events-plugin#commands) |
| **discord** | Bridge only — no in-game commands | [UrsaMU/discord-plugin](https://github.com/UrsaMU/discord-plugin) |
