---
layout: layout.vto
title: MUSH Compatibility
description: What UrsaMU supports compared to traditional MUSH servers like PennMUSH and TinyMUX, and what's planned.
---

# MUSH Compatibility

UrsaMU is **not a drop-in replacement** for PennMUSH, TinyMUSH, or MUX2. It is a fresh platform with a different architecture — WebSocket-native, TypeScript, sandboxed scripts instead of MUSHcode.

If you are migrating from a traditional MUSH or hosting your first server, this page tells you exactly what works today and what is planned.
---

## What Works Today

| Feature | Status | Notes |
|---------|--------|-------|
| `connect <name> <password>` | ✅ Working | Standard login command |
| `create <name> <password>` | ✅ Working | Character creation |
| `look` / `l` | ✅ Working | Room and object descriptions |
| Auto-`look` on connect | ✅ Working | Fires automatically after login |
| `say` / `"` | ✅ Working | Room speech |
| `pose` / `:` | ✅ Working | Emotes |
| `page <player>=<msg>` | ✅ Working | Private messages |
| `who` | ✅ Working | Online player list |
| `score` | ✅ Working | Character stats |
| `inventory` / `inv` | ✅ Working | Carried objects |
| `get` / `drop` / `give` | ✅ Working | Object interaction |
| `home` | ✅ Working | Return to home location |
| `teleport` | ✅ Working | Admin/wizard teleport |
| `examine` | ✅ Working | Full object inspection |
| `@desc` / `@name` | ✅ Working | Object descriptions and naming |
| `@dig` | ✅ Working | Create rooms |
| `@open` / `@link` / `@unlink` | ✅ Working | Exit management |
| `@create` | ✅ Working | Create objects |
| `@destroy` / `@clone` | ✅ Working | Object lifecycle |
| `@lock` / `@set` | ✅ Working | Flags and locks |
| `@parent` | ✅ Working | Object inheritance |
| `@boot` / `@toad` | ✅ Working | Admin user management |
| `@newpassword` | ✅ Working | Password reset |
| `@chown` | ✅ Working | Ownership transfer |
| `@channel/list/join/leave` | ✅ Working | Channel system |
| `@chancreate` / `@chandestroy` / `@chanset` | ✅ Working | Channel admin |
| `@reboot` / `@shutdown` | ✅ Working | Server control (admin+) |
| `@moniker` | ✅ Working | Color-coded display names (admin+) |
| Connection banner | ✅ Working | `text/default_connect.txt` shown pre-auth |
| Broadcast on connect/disconnect | ✅ Working | Room sees join/leave messages |
| Exit movement (type exit name) | ✅ Working | Standard directional movement |
| Help system | ✅ Working | `help [<topic>]` |
| Discord bridge | ✅ Working | Relay in-game chat to Discord |
| Scene tracking & export | ✅ Working | REST API, Markdown or JSON output |
| `@emit` / `@pemit` / `@remit` | ✅ Working | Staff broadcast commands |
| MOTD (`@motd`, `@motd/set`) | ✅ Working | Displayed automatically on login |
| Login notifications | ✅ Working | Unread mail + new bboard posts on connect |
| Connection history | ✅ Working | Last login time and failed attempt count |
| Bulletin board (`@bblist`, `@bbread`, `@bbpost`) | ✅ Working | Full bboard system with unread tracking |
| `@quota` | ✅ Working | View and set object quota |
| `@find` | ✅ Working | Search objects by name, flag, or type |
| `@stats` | ✅ Working | Server uptime and object counts |
| `@trigger <obj>/<attr>` | ✅ Working | Fire stored attributes as scripts |
| `@wipe <obj>` | ✅ Working | Clear all user-set attributes |
| `@Aconnect` / `@Adisconnect` | ✅ Working | `&ACONNECT` / `&ADISCONNECT` attributes fire on login/logout |
| MUX softcode evaluator | ✅ Working | TinyMUX 2.x compatible — see [Softcode](#mux-softcode-support) below |
| `@tag` / `@ltag` | ✅ Working | Global and personal named-object registry (RhostMUSH-style) |
| `@switch` | ✅ Working | Eval value as softcode, compare cases, execute matching action |
| `@dolist` | ✅ Working | Iterate a softcode list, execute action per item with `##`/`#@` |
| `$pattern` attrs | ✅ Working | Objects respond to player input via `$<glob>:<action>` attributes; captures map to `%0`–`%9` |
---

## MUX Softcode Support

UrsaMU Phase 1 ships a full TinyMUX 2.x compatible softcode evaluator alongside the TypeScript sandbox. In-game object attributes can be written in MUX softcode; all system scripts remain in TypeScript.

### How it works

- **TypeScript/JS attributes** (default) — executed in the existing Deno Web Worker sandbox.
- **Softcode attributes** — executed in a dedicated softcode Deno Worker with a 100ms wall-clock timeout.

To mark an attribute as softcode when setting it with `&`:

```
&GREET/softcode me=[name(%#)] greets you!
```

The `/softcode` flag persists on the attribute and routes all future evaluations through the softcode engine. Omitting the flag uses the TypeScript sandbox as before. Attributes that contain MUX substitution syntax (`%N`, `[func()]`) and no TypeScript keywords are also auto-detected as softcode.

### Supported functions (~250 total)

| Category | Functions |
|----------|-----------|
| Math | `add`, `sub`, `mul`, `div`, `mod`, `abs`, `floor`, `ceil`, `round`, `power`, `sqrt`, `exp`, `sin`, `cos`, `tan`, `rand`, `max`, `min`, `isnum`, `isint`, `eq`, `gt`, `lt`, `gte`, `lte`, `band`, `bor`, `bxor`, `shl`, `shr`, `dist2d`, `dist3d`, `vadd`, `vsub`, `vmul`, `vmag`, `vunit`, `vcross`, `vdot`, … |
| String | `strlen`, `upcase`, `lowcase`, `capstr`, `trim`, `squish`, `left`, `right`, `mid`, `ljust`, `rjust`, `center`, `before`, `after`, `index`, `pos`, `lpos`, `edit`, `reverse`, `space`, `repeat`, `chr`, `ord`, `cat`, `strcat`, `strmatch`, `comp`, `alpha`, `regex`, `regmatch`, `regrab`, `regraball`, `wrap`, `columns`, `ansi`, `stripansi`, `sha1`, `spellnumber`, `itemize`, … |
| List | `words`, `word`, `first`, `rest`, `last`, `extract`, `elements`, `member`, `lnum`, `ldelete`, `insert`, `replace`, `remove`, `revwords`, `shuffle`, `splice`, `grab`, `graball`, `match`, `matchall`, `pickrand`, `setunion`, `setinter`, `setdiff`, `sort`, `sortby`, `ladd`, `lmin`, `lmax`, `iter`, `parse`, `map`, `filter`, `filterbool`, `fold`, `foreach`, `munge`, `step`, `mix`, `distribute`, `merge`, `table`, … |
| Logic | `t`, `not`, `and`, `or`, `xor`, `cand`, `cor`, `andflags`, `orflags`, `if`, `ifelse`, `switch`, `case`, `null`, `lit`, `@@`, … |
| Object | `name`, `fullname`, `dbref`, `num`, `type`, `hastype`, `hasflag`, `flags`, `lflags`, `setflag`, `unflag`, `loc`, `where`, `room`, `home`, `contents`, `lcon`, `lexits`, `lwho`, `lplayers`, `match`, `pmatch`, `nearby`, `u`, `ulocal`, `get`, `default`, `xget`, `attr`, `lattr`, `hasattr`, `v`, `conn`, `connlast`, `connnum`, `idle`, `doing`, `host`, `ip`, `money`, `mudname`, `version`, `conntotal`, … |
| Register | `setq`, `setr`, `r`, `localize` |
| Output | `pemit`, `remit`, `oemit`, `cemit`, `emit`, `npemit`, `trigger` |
| Tags | `tag`, `istag`, `listtags`, `tagmatch`, `ltag`, `isltag`, `listltags`, `ltagmatch` |

### Substitutions

All standard TinyMUX substitutions are supported: `%#` (enactor dbref), `%!` (executor dbref), `%@` (caller), `%N`/`%n` (name), `%L` (location), `%s`/`%S`/`%o`/`%O`/`%p`/`%P`/`%a` (pronouns), `%0`–`%9` (args), `%q0`–`%qz` (registers), `##` / `#@` (iter variables), `%VA`–`%VZ` (object attributes), `%r` (newline), `%t` (tab), `%b` (space), `%%` (literal `%`), full ANSI color codes (`%ch`, `%cr`, `%cg`, `%cb`, `%cy`, `%cw`, `%cc`, `%cn`, `%xN` truecolor).

### TinyMUX compatibility stubs

| Function | Behavior |
|----------|----------|
| `sql()` | Returns `#-1 FUNCTION DISABLED` |
| `rxlevel()` / `txlevel()` | Returns `0` |
| `beep()` | Returns `""` |
| `height()` / `width()` | Returns `24` / `78` |
| `colordepth()` | Returns `256` |
| `textfile()` / `text()` | Returns `""` |

---

## @tag / @ltag — Named Object Registry

UrsaMU ships a RhostMUSH-style named object registry. Instead of remembering dbrefs, you can assign human-readable names to objects.

### @tag (global, wizard-only)

```
@tag citygate=here          Register current room as "citygate"
@tag vault=#142             Register #142 as "vault"
@tag                        (no args) list all tags
@tag/remove citygate        Remove the "citygate" global tag
```

Global tags are visible to everyone. Only wizards and admins may create or remove them. When a tagged object is destroyed, its tags are automatically removed.

### @ltag (personal, any player)

```
@ltag home=here             Register current room as your "home"
@ltag/list                  List all your personal tags
@ltag/remove home           Remove your personal "home" tag
```

Personal tags are scoped to your character (max 50). They are visible only in your own softcode evaluations.

### Softcode usage

```
[tag(citygate)]             → dbref of the citygate room
[istag(vault)]              → 1 if "vault" global tag exists
[tagmatch(here,citygate)]   → 1 if here is tagged "citygate"
[ltag(home)]                → dbref of your personal "home" tag
[name(#citygate)]           → name of the citygate object (shorthand)
```

The `#tagname` shorthand works anywhere an object reference is accepted in softcode (personal tags shadow global ones).

---

## What's Different from Traditional MUSH

| Traditional MUSH | UrsaMU |
|-----------------|--------|
| MUSHcode scripting only | TypeScript/JS sandbox **and** MUX softcode — both supported |
| Telnet primary | WebSocket primary (Telnet sidecar available) |
| All attributes run softcode | `&ATTR/softcode` opts in; default is TypeScript sandbox |
| `@tr` / `@trigger` | `@trigger <obj>/<attr>` command + `u.trigger()` SDK method |
| `@pemit` / `@remit` | `@pemit` and `@remit` — both implemented |
| No named-object registry | `@tag` / `@ltag` provide global and personal registries |

---

## Planned Enhancements

| Feature | Notes |
|---------|-------|
| Terminal/screen settings | Width detection via Telnet NAWS, persistent pager settings |
---

## Connecting with a Traditional MU* Client

UrsaMU's Telnet sidecar makes it compatible with any standard MU* client:

| Client | Platform | Connection |
|--------|---------|-----------|
| [Mudlet](https://www.mudlet.org/) | Windows / Mac / Linux | Host + port (default `4201`) |
| [MUSHclient](https://mushclient.com/) | Windows | Host + port (default `4201`) |
| [Potato](https://www.potatomushclient.com/) | Windows / Mac / Linux | Host + port (default `4201`) |
| SimpleMU | Windows | Host + port (default `4201`) |
| Any terminal | Any | `telnet <host> 4201` |

WebSocket-capable clients can connect directly to port `4202` (or `4203` for HTTP/WS).
