---
layout: layout.njk
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

This guide will help you get started with UrsaMU as a player, covering everything from basic commands to advanced features.

## Getting Started

### Connecting to UrsaMU

You can connect to an UrsaMU server in several ways:

1. **Web Client**: Most UrsaMU servers provide a web client that you can access through your browser.
2. **Telnet Client**: You can use a telnet client to connect to the server's port.
3. **MU* Client**: Specialized clients like Mudlet, TinTin++, or MUSHclient can provide enhanced features.

### Creating an Account

Before you can play, you'll need to create an account:

1. Connect to the server
2. Type `create <username> <password>` to create a new account
3. Follow the prompts to complete your registration

## Basic Commands

UrsaMU uses a command-based interface. Here are some essential commands to get you started:

- `help` - Display help information
- `look` or `l` - Look at your surroundings
- `say <message>` or `"<message>` - Say something to everyone in the room
- `pose <action>` or `:<action>` - Perform an action
- `@who` - See who is currently online
- `quit` - Disconnect from the server

## Character Creation

After creating an account, you'll want to set up your character:

### Setting Character Information

- `@name <name>` - Set your character's name
- `@desc <description>` - Set your character's description
- `@sex <gender>` - Set your character's gender
- `@alias <alias>` - Set an alias for your character

### Character Attributes

UrsaMU allows you to set various attributes for your character:

- `@set me=<attribute>:<value>` - Set an attribute on your character
- `@list me` - List all attributes on your character

## Communication

There are several ways to communicate with other players in UrsaMU:

### Local Communication

- `say <message>` or `"<message>` - Talk to people in the same room
- `pose <action>` or `:<action>` - Perform an action visible to others in the room
- `whisper <player>=<message>` - Send a private message to someone in the same room

### Global Communication

- `page <player>=<message>` - Send a private message to any connected player
- `@channel/join <channel>` - Join a chat channel
- `<channel> <message>` - Send a message to a channel

## Building

If you have building permissions, you can create and modify the game world:

### Creating Rooms

- `@dig <room name>` - Create a new room
- `@open <exit name>=<destination>` - Create an exit to another room
- `@link <exit>=<destination>` - Link an exit to a destination

### Creating Objects

- `@create <object name>` - Create a new object
- `@set <object>=<attribute>:<value>` - Set an attribute on an object

## Advanced Features

UrsaMU offers many advanced features for experienced players:

### Scripting

- `@program <name>=<code>` - Create a new program
- `@trigger <object>/<attribute>=<event>` - Set up a trigger on an object

### Permissions

- `@lock <object>=<lock expression>` - Set a lock on an object
- `@chown <object>=<player>` - Change the owner of an object

### Customization

- `@config <option>=<value>` - Configure your client settings
- `@alias <alias>=<command>` - Create a command alias

For more detailed information on any of these topics, use the `help <topic>` command in-game. 