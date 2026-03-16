---
layout: layout.vto
title: User Guide
description: Learn how to use UrsaMU as a player
nav:
  - text: Getting Started
    url: "#getting-started"
  - text: Basic Commands
    url: "#basic-commands"
  - text: Character Creation
    url: "#character-creation"
  - text: Communication
    url: "#communication"
  - text: Building
    url: "#building"
  - text: Advanced Features
    url: "#advanced-features"
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
3. __MU_ Client_*: Specialized clients like Mudlet, TinTin++, or MUSHclient can
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
- `examine <object>` — Inspect an object's full details (owner, flags, contents)
- `doing` — Show your current activity/status line

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
