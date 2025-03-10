---
layout: layout.njk
description: Create your first UrsaMU plugin with this step-by-step guide
nav:
  - text: Prerequisites
    url: "#prerequisites"
  - text: Creating the Plugin Structure
    url: "#creating-the-plugin-structure"
  - text: Implementing the Plugin
    url: "#implementing-the-plugin"
  - text: Testing Your Plugin
    url: "#testing-your-plugin"
  - text: Next Steps
    url: "#next-steps"
---

# Creating Your First Plugin

This guide will walk you through creating a simple UrsaMU plugin from scratch. We'll create a "dice roller" plugin that adds commands for rolling dice in the game.

## Prerequisites

Before you begin, make sure you have:

1. A working UrsaMU installation
2. Basic knowledge of TypeScript
3. A code editor (VS Code recommended)

## Creating the Plugin Structure

UrsaMU provides a task to create a new plugin structure. Open your terminal and run:

```bash
deno task create-plugin dice-roller
```

This will create a new directory `src/plugins/dice-roller/` with the following structure:

```
src/plugins/dice-roller/
├── index.ts           # Main plugin file
├── scripts/           # Utility scripts
│   └── run.sh         # Script to run both servers
└── src/               # Source code
    ├── main.ts        # Main server entry point
    └── telnet.ts      # Telnet server entry point
```

If you prefer to create the structure manually, create the following files:

1. Create the plugin directory:
```bash
mkdir -p src/plugins/dice-roller
```

2. Create the main plugin file:
```bash
touch src/plugins/dice-roller/index.ts
```

## Implementing the Plugin

Now, let's implement our dice roller plugin. Open `src/plugins/dice-roller/index.ts` and add the following code:

```typescript
import { App, IPlugin } from "ursamu";

/**
 * A plugin that adds dice rolling commands to UrsaMU
 */
export default class DiceRollerPlugin implements IPlugin {
  name = "dice-roller";
  version = "1.0.0";
  description = "Adds dice rolling commands to UrsaMU";
  author = "Your Name";
  
  // Default configuration
  config = {
    maxDice: 100,    // Maximum number of dice that can be rolled at once
    maxSides: 1000,  // Maximum number of sides per die
  };
  
  /**
   * Initialize the plugin
   */
  onInit(app: App): void {
    // Register the roll command
    app.commands.register("dice-roller", {
      name: "roll",
      pattern: "roll *",
      flags: "connected",
      exec: (ctx) => {
        const args = ctx.args.trim();
        
        // If no arguments, show help
        if (!args) {
          return ctx.send(`
            |cDice Roller Help|n
            Usage: roll <number>d<sides> [+/-<modifier>]
            Examples:
              roll 1d6       - Roll a 6-sided die
              roll 2d10      - Roll two 10-sided dice
              roll 3d6+2     - Roll three 6-sided dice and add 2
              roll 2d20-1    - Roll two 20-sided dice and subtract 1
          `);
        }
        
        // Parse the dice expression
        const result = this.parseDiceExpression(args);
        
        if (result.error) {
          return ctx.send(`|rError:|n ${result.error}`);
        }
        
        // Format the result
        const rollText = result.rolls.join(", ");
        const totalText = result.modifier !== 0 
          ? `${result.total - result.modifier} ${result.modifier > 0 ? '+' : ''}${result.modifier} = ${result.total}`
          : result.total.toString();
        
        ctx.send(`
          |c${ctx.player.name} rolls ${args}|n
          Rolls: ${rollText}
          Total: ${totalText}
        `);
      }
    });
    
    console.log(`${this.name} initialized`);
  }
  
  /**
   * Parse a dice expression like "3d6+2"
   */
  parseDiceExpression(expression: string) {
    // Regular expression to match dice notation
    const diceRegex = /^(\d+)d(\d+)(?:([+-])(\d+))?$/i;
    const match = expression.match(diceRegex);
    
    if (!match) {
      return { error: "Invalid dice expression. Use format: NdS[+/-M] (e.g., 3d6+2)" };
    }
    
    const numDice = parseInt(match[1], 10);
    const numSides = parseInt(match[2], 10);
    const modifierSign = match[3] || "+";
    const modifierValue = match[4] ? parseInt(match[4], 10) : 0;
    const modifier = modifierSign === "+" ? modifierValue : -modifierValue;
    
    // Validate the dice parameters
    if (numDice <= 0 || numDice > this.config.maxDice) {
      return { error: `Number of dice must be between 1 and ${this.config.maxDice}` };
    }
    
    if (numSides <= 0 || numSides > this.config.maxSides) {
      return { error: `Number of sides must be between 1 and ${this.config.maxSides}` };
    }
    
    // Roll the dice
    const rolls: number[] = [];
    let total = 0;
    
    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * numSides) + 1;
      rolls.push(roll);
      total += roll;
    }
    
    // Add the modifier
    total += modifier;
    
    return { rolls, total, modifier };
  }
  
  /**
   * Called when the plugin is loaded
   */
  onLoad(app: App): void {
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  /**
   * Called when the plugin is unloaded
   */
  onUnload(app: App): void {
    console.log(`${this.name} unloaded`);
  }
}
```

## Testing Your Plugin

Now that you've created your plugin, let's test it:

1. Make sure your plugin is enabled in your configuration file (`config/config.json`):

```json
{
  "plugins": {
    "dice-roller": {
      "maxDice": 100,
      "maxSides": 1000
    }
  }
}
```

2. Start your UrsaMU server:

```bash
deno task start
```

3. Connect to your server using a telnet client or the web interface.

4. Try using the roll command:

```
roll 3d6
```

You should see output similar to:

```
YourName rolls 3d6
Rolls: 4, 2, 6
Total: 12
```

Try other dice expressions:

```
roll 2d20+5
roll 1d100-10
roll 4d4
```

## Next Steps

Congratulations! You've created your first UrsaMU plugin. Here are some ways you could extend this plugin:

1. Add more dice rolling commands (e.g., `rollpublic`, `rollprivate`)
2. Add special dice types (e.g., Fate/Fudge dice, exploding dice)
3. Add dice macros that players can save and reuse
4. Add statistics tracking for dice rolls

For more advanced plugin development, check out these guides:

- [Plugin Hooks](./hooks.md) - Learn how to hook into UrsaMU events
- [Plugin Configuration](./configuration.md) - More advanced configuration options
- [Plugin Dependencies](./dependencies.md) - How to depend on other plugins

Remember that plugins are a powerful way to extend UrsaMU without modifying the core code. By keeping your customizations in plugins, you ensure that your game can be easily updated when new versions of UrsaMU are released. 