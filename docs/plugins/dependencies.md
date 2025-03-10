---
layout: layout.njk
description: Learn how to manage dependencies between UrsaMU plugins
nav:
  - text: Understanding Plugin Dependencies
    url: "#understanding-plugin-dependencies"
  - text: Declaring Dependencies
    url: "#declaring-dependencies"
  - text: Accessing Other Plugins
    url: "#accessing-other-plugins"
  - text: Dependency Resolution
    url: "#dependency-resolution"
  - text: Best Practices
    url: "#best-practices"
  - text: Examples
    url: "#examples"
---

# Plugin Dependencies

This guide explains how to manage dependencies between UrsaMU plugins, allowing your plugins to work together and build upon each other's functionality.

## Understanding Plugin Dependencies

In UrsaMU, plugins can depend on other plugins to extend or use their functionality. This allows you to:

- Create modular plugins that focus on specific features
- Build upon existing plugins without duplicating code
- Create plugin ecosystems where plugins work together

Dependencies are declared in your plugin class and are automatically resolved by UrsaMU's plugin manager when loading plugins.

## Declaring Dependencies

To declare that your plugin depends on other plugins, add a `dependencies` array to your plugin class:

```typescript
import { App, IPlugin } from "ursamu";

export default class MyPlugin implements IPlugin {
  name = "my-plugin";
  version = "1.0.0";
  description = "A plugin that depends on other plugins";
  author = "Your Name";
  
  // Declare dependencies
  dependencies = ["plugin-a", "plugin-b"];
  
  // Rest of your plugin implementation
  // ...
}
```

In this example, `my-plugin` depends on both `plugin-a` and `plugin-b`. UrsaMU will ensure that these plugins are loaded before `my-plugin`.

### Optional Dependencies

Sometimes you might want to use another plugin if it's available, but your plugin can still function without it. You can handle this by checking if the dependency is available at runtime:

```typescript
onInit(app: App): void {
  // Check if an optional dependency is available
  const optionalPlugin = app.plugins.get("optional-plugin");
  
  if (optionalPlugin) {
    // Use the optional plugin
    console.log("Optional plugin is available, using its features");
    this.useOptionalFeatures(optionalPlugin);
  } else {
    // Fall back to basic functionality
    console.log("Optional plugin is not available, using basic features");
    this.useBasicFeatures();
  }
}
```

## Accessing Other Plugins

Once you've declared dependencies, you can access other plugins through the `app.plugins` manager:

```typescript
onInit(app: App): void {
  // Get a reference to a dependency
  const pluginA = app.plugins.get("plugin-a");
  
  if (pluginA) {
    // Use pluginA's functionality
    console.log(`Using ${pluginA.name} v${pluginA.version}`);
    
    // Access public methods or properties
    if (typeof pluginA.somePublicMethod === 'function') {
      pluginA.somePublicMethod();
    }
  }
}
```

### Type Safety with Plugin Interfaces

For better type safety, you can define interfaces for the plugins you depend on:

```typescript
// Define an interface for the plugin you depend on
interface PluginA extends IPlugin {
  somePublicMethod(): void;
  somePublicProperty: string;
}

onInit(app: App): void {
  // Get a reference to a dependency with type casting
  const pluginA = app.plugins.get("plugin-a") as PluginA;
  
  if (pluginA) {
    // Now TypeScript knows about the methods and properties
    console.log(pluginA.somePublicProperty);
    pluginA.somePublicMethod();
  }
}
```

## Dependency Resolution

UrsaMU's plugin manager handles dependency resolution automatically. Here's how it works:

1. The plugin manager scans all available plugins
2. It builds a dependency graph based on the `dependencies` arrays
3. It sorts the plugins in dependency order (dependencies first)
4. It initializes and loads the plugins in the correct order

If there are circular dependencies (A depends on B, B depends on A), the plugin manager will detect this and report an error.

### Dependency Errors

If a required dependency is missing, UrsaMU will log an error and not load your plugin:

```
Error: Plugin "my-plugin" depends on "missing-plugin", but it is not available.
```

To avoid this, make sure all your dependencies are installed and enabled in the configuration.

## Best Practices

### Minimize Dependencies

Keep your dependencies to a minimum. Each dependency makes your plugin more fragile and harder to maintain.

### Document Dependencies

Clearly document your plugin's dependencies in your plugin's documentation:

```typescript
/**
 * A plugin that extends the chat system with emoji support.
 * 
 * @requires chat-system - This plugin extends the chat-system plugin
 * @requires emoji-data - This plugin uses emoji data from the emoji-data plugin
 */
export default class EmojiChatPlugin implements IPlugin {
  // ...
}
```

### Version Compatibility

Be aware that plugins may change between versions. If you depend on specific functionality, you might want to check the version of the dependency:

```typescript
onInit(app: App): void {
  const dependency = app.plugins.get("some-plugin");
  
  if (dependency) {
    // Check version compatibility
    const version = dependency.version.split('.');
    const major = parseInt(version[0], 10);
    const minor = parseInt(version[1], 10);
    
    if (major < 2 || (major === 2 && minor < 5)) {
      console.warn(`${this.name} requires some-plugin v2.5.0 or higher, but found v${dependency.version}`);
    }
  }
}
```

### Provide Public APIs

If you're creating a plugin that others might depend on, provide a clear public API:

```typescript
export default class UtilityPlugin implements IPlugin {
  name = "utility";
  version = "1.0.0";
  description = "Provides utility functions for other plugins";
  author = "Your Name";
  
  // Public API methods that other plugins can use
  formatTimestamp(date: Date): string {
    return date.toISOString();
  }
  
  generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
  
  // Internal methods (prefixed with underscore)
  _internalMethod(): void {
    // This method is not meant to be used by other plugins
  }
  
  // Rest of your plugin implementation
  // ...
}
```

## Examples

### Simple Dependency Example

Here's an example of a plugin that depends on a "chat-system" plugin to add emoji support:

```typescript
import { App, IPlugin } from "ursamu";

// Define an interface for the chat-system plugin
interface ChatSystemPlugin extends IPlugin {
  formatMessage(message: string): string;
  sendChannelMessage(channel: string, sender: string, message: string): void;
}

export default class EmojiPlugin implements IPlugin {
  name = "emoji";
  version = "1.0.0";
  description = "Adds emoji support to the chat system";
  author = "Your Name";
  
  // Declare dependency on chat-system
  dependencies = ["chat-system"];
  
  // Emoji mapping
  private emojiMap: Record<string, string> = {
    ":smile:": "😊",
    ":laugh:": "😂",
    ":sad:": "😢",
    ":heart:": "❤️",
    // ... more emoji mappings
  };
  
  onInit(app: App): void {
    // Get the chat-system plugin
    const chatSystem = app.plugins.get("chat-system") as ChatSystemPlugin;
    
    if (!chatSystem) {
      console.error("Chat system plugin not found!");
      return;
    }
    
    // Register a hook to process messages before they're sent
    app.hooks.on("chat:before-send", (data) => {
      // Replace emoji codes with actual emoji
      data.message = this.replaceEmoji(data.message);
      return data;
    });
    
    // Register an emoji command
    app.commands.register("emoji", {
      name: "emoji",
      pattern: "emoji *",
      flags: "connected",
      exec: (ctx) => {
        const args = ctx.args.trim();
        
        if (!args) {
          // List available emoji
          const emojiList = Object.keys(this.emojiMap)
            .map(code => `${code} - ${this.emojiMap[code]}`)
            .join("\n");
          
          ctx.send(`|cAvailable Emoji:|n\n${emojiList}`);
          return;
        }
        
        // Send an emoji to the current channel
        const currentChannel = ctx.player.get("currentChannel") || "Public";
        chatSystem.sendChannelMessage(
          currentChannel,
          ctx.player.name,
          this.replaceEmoji(args)
        );
      }
    });
    
    console.log(`${this.name} initialized`);
  }
  
  // Replace emoji codes with actual emoji
  replaceEmoji(message: string): string {
    let result = message;
    
    for (const [code, emoji] of Object.entries(this.emojiMap)) {
      result = result.replace(new RegExp(code, 'g'), emoji);
    }
    
    return result;
  }
  
  onLoad(app: App): void {
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    console.log(`${this.name} unloaded`);
  }
}
```

### Complex Dependency Example

Here's a more complex example of a plugin that depends on multiple plugins to create an achievement system:

```typescript
import { App, IPlugin, Player } from "ursamu";

// Define interfaces for the plugins we depend on
interface DatabasePlugin extends IPlugin {
  saveData(collection: string, id: string, data: any): Promise<void>;
  getData(collection: string, id: string): Promise<any>;
  listData(collection: string): Promise<string[]>;
}

interface NotificationPlugin extends IPlugin {
  notify(player: Player, message: string, type: string): void;
}

interface EventsPlugin extends IPlugin {
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

export default class AchievementPlugin implements IPlugin {
  name = "achievements";
  version = "1.0.0";
  description = "Adds an achievement system to the game";
  author = "Your Name";
  
  // Declare dependencies
  dependencies = ["database", "notifications"];
  
  // Optional dependency
  private eventsPlugin: EventsPlugin | null = null;
  
  // Achievement definitions
  private achievements: Record<string, {
    name: string;
    description: string;
    icon: string;
    secret: boolean;
    criteria: (player: Player) => boolean | Promise<boolean>;
  }> = {};
  
  // Event handlers
  private eventHandlers: Record<string, (data: any) => void> = {};
  
  onInit(app: App): void {
    // Get required dependencies
    const dbPlugin = app.plugins.get("database") as DatabasePlugin;
    const notifyPlugin = app.plugins.get("notifications") as NotificationPlugin;
    
    if (!dbPlugin || !notifyPlugin) {
      console.error("Required dependencies not found!");
      return;
    }
    
    // Check for optional dependency
    this.eventsPlugin = app.plugins.get("events") as EventsPlugin;
    
    // Define some achievements
    this.registerAchievement({
      id: "first-login",
      name: "First Steps",
      description: "Log in to the game for the first time",
      icon: "🏆",
      secret: false,
      criteria: () => true // Always awarded on first check
    });
    
    this.registerAchievement({
      id: "explorer",
      name: "Explorer",
      description: "Visit 10 different rooms",
      icon: "🧭",
      secret: false,
      criteria: async (player) => {
        // Get the player's visited rooms from the database
        const data = await dbPlugin.getData("player-data", player.dbref);
        const visitedRooms = data?.visitedRooms || [];
        return visitedRooms.length >= 10;
      }
    });
    
    // Register commands
    app.commands.register("achievements", {
      name: "achievements",
      pattern: "achievements",
      flags: "connected",
      exec: async (ctx) => {
        // Get the player's achievements
        const data = await dbPlugin.getData("achievements", ctx.player.dbref);
        const earned = data?.earned || [];
        
        // Format the achievement list
        let message = "|cYour Achievements:|n\n";
        
        for (const [id, achievement] of Object.entries(this.achievements)) {
          if (earned.includes(id) || !achievement.secret) {
            const status = earned.includes(id) ? "|g✓|n" : "|r✗|n";
            message += `${status} ${achievement.icon} ${achievement.name}: ${achievement.description}\n`;
          }
        }
        
        ctx.send(message);
      }
    });
    
    // Set up event handlers if the events plugin is available
    if (this.eventsPlugin) {
      // Handler for room entry
      this.eventHandlers.roomEnter = async (data) => {
        const { player, room } = data;
        
        // Get the player's data
        const playerData = await dbPlugin.getData("player-data", player.dbref) || {};
        
        // Update visited rooms
        const visitedRooms = new Set(playerData.visitedRooms || []);
        visitedRooms.add(room.dbref);
        playerData.visitedRooms = Array.from(visitedRooms);
        
        // Save the updated data
        await dbPlugin.saveData("player-data", player.dbref, playerData);
        
        // Check achievements
        this.checkAchievements(player, notifyPlugin);
      };
      
      // Register the event handlers
      this.eventsPlugin.on("room:enter", this.eventHandlers.roomEnter);
    }
    
    // Register a hook for player connection to check achievements
    app.hooks.on("player:connect", async (player) => {
      await this.checkAchievements(player, notifyPlugin);
    });
    
    console.log(`${this.name} initialized with ${Object.keys(this.achievements).length} achievements`);
  }
  
  onLoad(app: App): void {
    console.log(`${this.name} v${this.version} loaded!`);
  }
  
  onUnload(app: App): void {
    // Clean up event handlers
    if (this.eventsPlugin) {
      for (const [event, handler] of Object.entries(this.eventHandlers)) {
        this.eventsPlugin.off(event, handler);
      }
    }
    
    console.log(`${this.name} unloaded`);
  }
  
  // Register a new achievement
  registerAchievement(achievement: {
    id: string;
    name: string;
    description: string;
    icon: string;
    secret: boolean;
    criteria: (player: Player) => boolean | Promise<boolean>;
  }): void {
    this.achievements[achievement.id] = achievement;
  }
  
  // Check if a player has earned any achievements
  async checkAchievements(player: Player, notifyPlugin: NotificationPlugin): Promise<void> {
    const dbPlugin = app.plugins.get("database") as DatabasePlugin;
    
    // Get the player's current achievements
    const data = await dbPlugin.getData("achievements", player.dbref) || {};
    const earned = new Set(data.earned || []);
    let newAchievements = false;
    
    // Check each achievement
    for (const [id, achievement] of Object.entries(this.achievements)) {
      // Skip already earned achievements
      if (earned.has(id)) continue;
      
      // Check if the player meets the criteria
      const meetsCondition = await achievement.criteria(player);
      
      if (meetsCondition) {
        // Award the achievement
        earned.add(id);
        newAchievements = true;
        
        // Notify the player
        notifyPlugin.notify(
          player,
          `|c🏆 Achievement Unlocked:|n ${achievement.icon} ${achievement.name}\n${achievement.description}`,
          "achievement"
        );
      }
    }
    
    // Save updated achievements if any were earned
    if (newAchievements) {
      await dbPlugin.saveData("achievements", player.dbref, {
        earned: Array.from(earned),
        lastUpdated: new Date().toISOString()
      });
    }
  }
}
```

By following these guidelines and examples, you can create plugins that work together effectively, building upon each other's functionality to create rich, extensible game experiences. 