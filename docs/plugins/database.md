---
layout: layout.vto
description: Learn how to use the database in UrsaMU plugins
nav:
  - text: Database Basics
    url: "#database-basics"
  - text: Database Services
    url: "#database-services"
  - text: CRUD Operations
    url: "#crud-operations"
  - text: Querying Data
    url: "#querying-data"
  - text: Examples
    url: "#examples"
---

# Using the Database in UrsaMU Plugins

This guide explains how to use the UrsaMU database system in your plugins to store and retrieve data.

## Database Basics

UrsaMU uses a simple database system for storing game objects and other data. The database is accessible through several services that provide methods for creating, reading, updating, and deleting data.

## Database Services

UrsaMU provides several database services for different types of data:

- **dbojs** - The main database for game objects (players, rooms, exits, things)
- **counters** - A database for counters (used for generating unique IDs)
- **chans** - A database for communication channels
- **mail** - A database for the mail system
- **bboard** - A database for bulletin boards

These services are imported from the Database service module:

```typescript
import { dbojs, counters, chans, mail, bboard } from "../../services/Database/index.ts";
```

## CRUD Operations

Each database service provides methods for creating, reading, updating, and deleting data.

### Creating Objects

To create a new object in the database, use the `create` method:

```typescript
// Create a new game object
const newObject = {
  flags: "thing",
  data: {
    name: "My Object",
    description: "A custom object created by a plugin"
  }
};

try {
  const obj = await dbojs.create(newObject);
  console.log(`Created object with ID: ${obj.id}`);
} catch (error) {
  console.error("Error creating object:", error);
}
```

### Reading Objects

To retrieve an object from the database, use the `get` method with the object's ID:

```typescript
// Get an object by ID
try {
  const obj = await dbojs.get("123");
  if (obj) {
    console.log(`Found object: ${obj.data.name}`);
  } else {
    console.log("Object not found");
  }
} catch (error) {
  console.error("Error getting object:", error);
}
```

### Updating Objects

To update an object in the database, modify the object and use the `update` method:

```typescript
// Update an object
try {
  const obj = await dbojs.get("123");
  if (obj) {
    // Modify the object
    obj.data.description = "Updated description";
    
    // Save the changes
    await dbojs.update(obj);
    console.log("Object updated");
  }
} catch (error) {
  console.error("Error updating object:", error);
}
```

### Deleting Objects

To delete an object from the database, use the `delete` method with the object's ID:

```typescript
// Delete an object
try {
  await dbojs.delete("123");
  console.log("Object deleted");
} catch (error) {
  console.error("Error deleting object:", error);
}
```

## Querying Data

UrsaMU provides a powerful query system for finding objects in the database.

### Basic Queries

To find objects that match specific criteria, use the `query` method:

```typescript
// Find all rooms
try {
  const rooms = await dbojs.query({ flags: /room/i });
  console.log(`Found ${rooms.length} rooms`);
} catch (error) {
  console.error("Error querying rooms:", error);
}
```

### Complex Queries

You can create more complex queries by combining multiple criteria:

```typescript
// Find all objects owned by a specific player
try {
  const objects = await dbojs.query({
    owner: "123",
    flags: /thing/i
  });
  console.log(`Found ${objects.length} objects owned by player 123`);
} catch (error) {
  console.error("Error querying objects:", error);
}
```

### Querying by Name

To find objects by name, you can use a regular expression:

```typescript
// Find a player by name (case-insensitive)
try {
  const players = await dbojs.query({
    "data.name": new RegExp("^PlayerName$", "i"),
    flags: /player/i
  });
  
  if (players.length > 0) {
    console.log(`Found player: ${players[0].data.name}`);
  } else {
    console.log("Player not found");
  }
} catch (error) {
  console.error("Error querying player:", error);
}
```

### Getting All Objects

To get all objects in a database, use the `all` method:

```typescript
// Get all channels
try {
  const channels = await chans.all();
  console.log(`Found ${channels.length} channels`);
} catch (error) {
  console.error("Error getting channels:", error);
}
```

## Examples

### Creating a Room

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { dbojs, counters } from "../../services/Database/index.ts";

const roomCreatorPlugin: IPlugin = {
  name: "room-creator",
  version: "1.0.0",
  description: "A plugin that creates custom rooms",
  
  init: async () => {
    try {
      // Get the next object ID
      let counter = await counters.get("objid");
      if (!counter) {
        // Create the counter if it doesn't exist
        counter = await counters.create({
          id: "objid",
          seq: 1
        });
      }
      
      // Increment the counter
      counter.seq += 1;
      await counters.update(counter);
      
      // Create a new room
      const roomId = counter.seq.toString();
      const newRoom = {
        id: roomId,
        flags: "room",
        data: {
          name: "Custom Room",
          description: "A room created by the room-creator plugin."
        }
      };
      
      const room = await dbojs.create(newRoom);
      console.log(`Created room with ID: ${room.id}`);
      
      return true;
    } catch (error) {
      console.error("Error creating room:", error);
      return false;
    }
  },
  
  remove: async () => {
    try {
      // Find and delete rooms created by this plugin
      const rooms = await dbojs.query({
        "data.name": "Custom Room",
        flags: /room/i
      });
      
      for (const room of rooms) {
        await dbojs.delete(room.id);
        console.log(`Deleted room with ID: ${room.id}`);
      }
    } catch (error) {
      console.error("Error cleaning up rooms:", error);
    }
  }
};

export default roomCreatorPlugin;
```

### Creating a Channel

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { chans } from "../../services/Database/index.ts";

const channelPlugin: IPlugin = {
  name: "channel-plugin",
  version: "1.0.0",
  description: "A plugin that creates a custom channel",
  
  init: async () => {
    try {
      // Check if the channel already exists
      const existingChannels = await chans.query({ id: "custom" });
      
      if (existingChannels.length === 0) {
        // Create the channel
        await chans.create({
          id: "custom",
          name: "Custom",
          header: "%ch%cg[Custom]%cn",
          alias: "cus",
          lock: "connected"
        });
        
        console.log("Created custom channel");
      } else {
        console.log("Custom channel already exists");
      }
      
      return true;
    } catch (error) {
      console.error("Error creating channel:", error);
      return false;
    }
  },
  
  remove: async () => {
    try {
      // Delete the custom channel
      await chans.delete("custom");
      console.log("Deleted custom channel");
    } catch (error) {
      console.error("Error deleting channel:", error);
    }
  }
};

export default channelPlugin;
```

### Player Inventory System

```typescript
import { IPlugin } from "../../@types/IPlugin.ts";
import { dbojs } from "../../services/Database/index.ts";
import { registerCommand } from "../../services/Commands/mod.ts";

const inventoryPlugin: IPlugin = {
  name: "inventory",
  version: "1.0.0",
  description: "A plugin that adds an inventory system",
  
  init: async () => {
    // Register the inventory command
    registerCommand({
      name: "inventory",
      pattern: "inventory/inv/i",
      flags: "connected",
      exec: async (ctx) => {
        try {
          // Get the player's inventory items
          const items = await dbojs.query({
            location: ctx.player.id,
            flags: /thing/i
          });
          
          if (items.length === 0) {
            ctx.send("You are not carrying anything.");
            return;
          }
          
          // Display the inventory
          let message = "|cYour Inventory:|n\n";
          
          for (const item of items) {
            message += `${item.data.name} - ${item.data.description || "No description"}\n`;
          }
          
          ctx.send(message);
        } catch (error) {
          ctx.send(`Error: ${error.message}`);
        }
      }
    });
    
    // Register the give command
    registerCommand({
      name: "give",
      pattern: "give *",
      flags: "connected",
      exec: async (ctx) => {
        const args = ctx.args.trim().split("=");
        
        if (args.length !== 2) {
          return ctx.send("Usage: give <item>=<player>");
        }
        
        const itemName = args[0].trim();
        const playerName = args[1].trim();
        
        try {
          // Find the item in the player's inventory
          const items = await dbojs.query({
            location: ctx.player.id,
            "data.name": new RegExp(`^${itemName}$`, "i"),
            flags: /thing/i
          });
          
          if (items.length === 0) {
            return ctx.send(`You don't have '${itemName}'.`);
          }
          
          const item = items[0];
          
          // Find the target player
          const players = await dbojs.query({
            "data.name": new RegExp(`^${playerName}$`, "i"),
            flags: /player/i
          });
          
          if (players.length === 0) {
            return ctx.send(`Player '${playerName}' not found.`);
          }
          
          const targetPlayer = players[0];
          
          // Move the item to the target player
          item.location = targetPlayer.id;
          await dbojs.update(item);
          
          ctx.send(`You give ${item.data.name} to ${targetPlayer.data.name}.`);
        } catch (error) {
          ctx.send(`Error: ${error.message}`);
        }
      }
    });
    
    return true;
  }
};

export default inventoryPlugin;
```

By following these guidelines and examples, you can effectively use the UrsaMU database system in your plugins to store and retrieve data. 