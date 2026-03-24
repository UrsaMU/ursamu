---
layout: layout.vto
title: User Guide
description: Learn how to use UrsaMU as a player
---

# User Guide

This guide will help you get started with UrsaMU as a player, covering
everything from basic commands to advanced features.

## Getting Started

### Connecting to UrsaMU

You can connect to an UrsaMU server in several ways:

1. **Web Client**: Most UrsaMU servers provide a web client that you can access
   through your browser.
2. **Telnet Client**: You can use a telnet client to connect to the server's
   port.
3. **MU\* Client**: Specialized clients like Mudlet, TinTin++, or MUSHclient can
   provide enhanced features.

### Creating an Account

Before you can play, you'll need to create an account:

1. Connect to the server
2. Type `create <username> <password>` to create a new account
3. Follow the prompts to complete your registration

## Basic Commands

UrsaMU uses a command-based interface. Here are some essential commands to get
you started:

- `help [<topic>]` — Display help information
- `look` or `l` — Look at your surroundings
- `say <message>` or `"<message>` — Say something to everyone in the room
- `pose <action>` or `:<action>` — Perform an emote/action
- `who` — See who is currently online
- `score` — View your character stats
- `inventory` or `inv` — List items you are carrying
- `quit` — Disconnect from the server

## Character Creation

After creating an account, you'll want to set up your character:

### Setting Character Information

- `@name me=<name>` — Rename your character
- `@desc me=<description>` — Set your character's description
- `@alias <alias>=<command>` — Create a personal command shortcut

### Examining Objects

- `look [<object>]` — Look at the room or a specific object
- `examine <object>` — Inspect an object's full technical details (requires edit permission or the `visual` flag on the target)
- `examine` — Examine the current room (no argument)
- `doing` — Show your current activity/status line

`examine` output includes:

- **Type** — Room, Player, Exit, or Thing
- **Flags** — all flags set on the object
- **Owner** — resolved to the owner's name and dbref
- **Lock** — the object's current lock expression
- **Location / Home** — resolved to room names and dbrefs
- **Description** — the object's description text
- **Exits** — exits in the room (for Room objects)
- **Contents** — things and players currently present
- **Attributes** — any custom `@set` attributes on the object

```
> examine me
===== Admin (#5) [Player] ===========================
Flags:    player wizard connected
Owner:    Admin (#5)
Location: The Hub (#1)
...
```

## Bulletin Boards

Bulletin boards are persistent message boards, organized by topic.

- `+bblist` — list all boards with post counts and unread counts
- `+bbread <board>` — list posts on a board
- `+bbread <board>/<num>` — read a specific post
- `+bbpost <board>=<subject>/<body>` — post to a board
- `+bbpost/edit <board>/<num>=<new body>` — edit one of your posts
- `+bbpost/delete <board>/<num>` — delete one of your posts

Board names are case-insensitive slugs (spaces become dashes):

```
+bbread general
+bbpost general=Welcome to the game/Hello everyone, looking forward to playing here!
```

Reading a post automatically marks that board as read.

## Staff Jobs

The jobs system lets players submit requests, bug reports, or ideas to staff.

- `+job <title>=<description>` — submit a request
- `+job/<category> <title>=<desc>` — submit with a category (`request`, `bug`, `app`, `idea`)
- `+jobs` — list all your open jobs
- `+job/view <#>` — view the full details of a job
- `+job/comment <#>=<text>` — add a comment to a job
- `+job/close <#>[=<reason>]` — close a job you submitted

## Communication

There are several ways to communicate with other players in UrsaMU:

### Local Communication

- `say <message>` or `"<message>` - Talk to people in the same room
- `pose <action>` or `:<action>` - Perform an action visible to others in the
  room

### Global Communication

- `page <player>=<message>` — Send a private message to any connected player
- `@channel/list` — List all available channels
- `@channel/join <channel>=<alias>` — Join a channel with a local alias
- `@channel/leave <alias>` — Leave a channel
- `<alias> <message>` — Send a message on a joined channel (using your alias)

## Wiki

The wiki is a shared knowledge base for lore, news, fiction, and game
information. All connected players can read and search it from in-game.

```
+wiki                         -- List top-level pages and directories
+wiki <path>                  -- Read a page or list a directory
+wiki/search <query>          -- Search all pages by title, body, or tag
```

**Examples:**

```
+wiki                         -- Show the wiki index
+wiki news                    -- List all pages under news/
+wiki news/patch-notes        -- Read a specific page
+wiki/search dragon           -- Find all pages mentioning "dragon"
```

Paths mirror the folder structure exactly. A page at `lore/factions/iron-circle`
is read with `+wiki lore/factions/iron-circle`.

> Staff members can create, edit, and fetch images with `@wiki` commands —
> see the [Admin Guide](/guides/admin-guide/#wiki-administration) for details.
---

## Object Interaction

You can pick up, drop, and exchange objects with other players:

- `get <object>` — Pick up an object from the room
- `drop <object>` — Drop an object into the current room
- `give <object>=<player>` — Give an object to another player in the room
- `inventory` or `inv` — List what you are carrying

## Movement

- Move through exits by typing the exit name (e.g., `north`, `n`)
- `home` — Return to your home location
- `teleport <destination>` — Teleport to a room or object (if permitted)

## Building

If you have building permissions, you can create and modify the game world:

### Creating Rooms

- `@dig <room name>` — Create a new room
- `@dig <room name>=<exit>/<return exit>` — Create a room with linked exits
- `@open <exit name>=<destination>` — Create an exit to another room
- `@link <exit>=<destination>` — Link an exit to a destination room
- `@unlink <exit>` — Remove a link from an exit

### Creating Objects

- `@create <object name>` — Create a new object
- `@clone <object>` — Clone an existing object
- `@destroy <object>` — Destroy an object (must be owner)
- `@parent <object>=<parent>` — Set a parent object for inheritance
- `@desc <object>=<text>` — Set an object's description
- `@name <object>=<new name>` — Rename an object
- `@moniker <object>=<display name>` — Set an alternate display name

### Permissions and Locks

- `@lock <object>=<lock expression>` — Set a lock on an object
- `@set <object>=<flag>` — Set a flag on an object (e.g., `@set box=locked`)
- `@set <object>=!<flag>` — Remove a flag

For more detailed information on any topic, use the `help <topic>` command
in-game.
