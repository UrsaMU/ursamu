---
layout: layout.vto
description: Learn how to create commands in UrsaMU plugins
nav:
  - text: Command Basics
    url: "#command-basics"
  - text: Command Structure
    url: "#command-structure"
  - text: Registering Commands
    url: "#registering-commands"
  - text: Command Context
    url: "#command-context"
  - text: Command Patterns
    url: "#command-patterns"
  - text: Examples
    url: "#examples"
---

# Creating Commands in UrsaMU Plugins

This guide explains how to create and register commands in your UrsaMU plugins.

## Command Basics

Commands are the primary way players interact with UrsaMU. They allow players to perform actions, get information, and interact with the game world. As a plugin developer, you can add new commands to extend the functionality of UrsaMU.

## Command Structure

In UrsaMU, commands are defined using the `ICmd` interface:

```typescript
interface ICmd {
  name: string;         // The name of the command
  pattern: string;      // The pattern to match for this command
  flags?: string;       // The flags required to use this command (optional)
  exec: (ctx: any) => void | Promise<void>; // The function to execute
}
```

### Command Name

The `name` property is a unique identifier for your command. It should be lowercase and contain only letters, numbers, and hyphens.

### Command Pattern

The `pattern` property is a string that defines when your command should be triggered. It can include wildcards to match different variations of the command. For example:

- `"look"` - Matches exactly "look"
- `"look *"` - Matches "look" followed by any text
- `"look/examine *"` - Matches either "look" or "examine" followed by any text

### Command Flags

The optional `flags` property defines the permissions required to use the command. It can be a single flag or a space-separated list of flags. For example:

- `"connected"` - The player must be connected
- `"wizard"` - The player must have the WIZARD flag
- `"connected wizard"` - The player must be both connected and have the WIZARD flag

### Command Execution Function

The `exec` property is a function that is called when the command is executed. It receives a context object that provides information about the command and the player who executed it.

## Registering Commands

To register a command in your plugin, use the `registerCommand` function in your plugin's `init` method:

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { registerCommand } from "../../services/Commands/mod.ts";

const myPlugin: IPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  description: "A plugin that adds custom commands",
  
  init: async () => {
    // Register a command
    registerCommand({
      name: "hello",
      pattern: "hello *",
      flags: "connected",
      exec: (ctx) => {
        const target = ctx.args.trim() || "world";
        ctx.send(`Hello, ${target}!`);
      }
    });
    
    return true;
  }
};

export default myPlugin;
```

## Command Context

The context object passed to the command's `exec` function provides information about the command and the player who executed it:

```typescript
interface CommandContext {
  player: any;          // The player who executed the command
  cmd: string;          // The command that was executed
  args: string;         // The arguments passed to the command
  switches: any;        // Any switches used with the command
  send: (msg: string) => void; // Function to send a message to the player
}
```

### Player

The `player` property is a reference to the player who executed the command. You can use this to get information about the player or perform actions on behalf of the player.

```typescript
exec: (ctx) => {
  const playerName = ctx.player.data.name;
  ctx.send(`Hello, ${playerName}!`);
}
```

### Command and Arguments

The `cmd` property contains the command that was executed, and the `args` property contains any text that follows the command pattern.

```typescript
exec: (ctx) => {
  ctx.send(`You executed: ${ctx.cmd} with args: ${ctx.args}`);
}
```

### Switches

The `switches` property contains any switches used with the command. Switches are specified with a forward slash followed by a name and optionally an equals sign and a value.

```typescript
exec: (ctx) => {
  if (ctx.switches.verbose) {
    ctx.send("Verbose mode enabled");
  }
  
  const format = ctx.switches.format || "standard";
  ctx.send(`Using format: ${format}`);
}
```

### Send

The `send` method sends a message to the player who executed the command.

```typescript
exec: (ctx) => {
  ctx.send("This message will be sent to the player");
}
```

## Command Patterns

Command patterns determine when your command is triggered. UrsaMU uses a simple pattern matching system:

### Exact Match

To match a command exactly, use the command name:

```typescript
pattern: "look"  // Matches exactly "look"
```

### Wildcard Match

To match a command followed by any text, use an asterisk:

```typescript
pattern: "look *"  // Matches "look" followed by any text
```

### Multiple Patterns

To match multiple patterns, separate them with a forward slash:

```typescript
pattern: "look/examine *"  // Matches either "look" or "examine" followed by any text
```

## Examples

### Simple Command

A simple command that greets the player:

```typescript
registerCommand({
  name: "greet",
  pattern: "greet *",
  flags: "connected",
  exec: (ctx) => {
    const target = ctx.args.trim() || "world";
    ctx.send(`Hello, ${target}!`);
  }
});
```

### Command with Switches

A command that uses switches to modify its behavior:

```typescript
registerCommand({
  name: "search",
  pattern: "search *",
  flags: "connected",
  exec: (ctx) => {
    const target = ctx.args.trim();
    const area = ctx.switches.area || "current";
    const detail = ctx.switches.detail || "normal";
    
    ctx.send(`Searching for ${target} in ${area} area with ${detail} detail level.`);
    // Search implementation
  }
});
```

### Command with Subcommands

A command with subcommands:

```typescript
registerCommand({
  name: "channel",
  pattern: "channel *",
  flags: "connected",
  exec: (ctx) => {
    const args = ctx.args.trim().split(" ");
    const subcommand = args[0];
    const subargs = args.slice(1).join(" ");
    
    switch (subcommand) {
      case "join":
        if (!subargs) {
          return ctx.send("Join which channel?");
        }
        ctx.send(`Joining channel ${subargs}.`);
        // Join implementation
        break;
      case "leave":
        if (!subargs) {
          return ctx.send("Leave which channel?");
        }
        ctx.send(`Leaving channel ${subargs}.`);
        // Leave implementation
        break;
      case "list":
        ctx.send("Available channels:");
        // List implementation
        break;
      default:
        ctx.send(`
          |cChannel Commands:|n
          channel join <name> - Join a channel
          channel leave <name> - Leave a channel
          channel list - List available channels
        `);
        break;
    }
  }
});
```

### Asynchronous Command

A command that performs asynchronous operations:

```typescript
registerCommand({
  name: "profile",
  pattern: "profile *",
  flags: "connected",
  exec: async (ctx) => {
    const target = ctx.args.trim() || ctx.player.data.name;
    
    try {
      // Get the target player
      const players = await dbojs.query({
        "data.name": new RegExp(`^${target}$`, "i"),
        flags: /player/i
      });
      
      if (players.length === 0) {
        return ctx.send(`Player ${target} not found.`);
      }
      
      const player = players[0];
      
      // Format the profile
      let message = `|c${player.data.name}'s Profile:|n\n`;
      message += `Description: ${player.data.description || "None"}\n`;
      
      ctx.send(message);
    } catch (error) {
      ctx.send(`Error: ${error.message}`);
    }
  }
});
```

By following these guidelines and examples, you can create powerful and user-friendly commands for your UrsaMU plugins. 