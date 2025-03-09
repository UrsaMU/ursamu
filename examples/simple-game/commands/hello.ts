/**
 * Hello Command
 * 
 * A simple command that greets the user or another player.
 */

import { addCmd } from "../../../src/services/commands/index.ts";
import { dbojs } from "../../../src/services/Database/index.ts";
import { send } from "../../../src/services/broadcast/index.ts";

export default () =>
  addCmd({
    name: "hello",
    pattern: /^hello(?:\s+(.+))?$/i,
    lock: "connected",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      
      const player = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!player) return;
      
      const playerName = player.data?.moniker || player.data?.name;
      
      // If no target is specified, just greet the player
      if (!args[1]) {
        send([ctx.socket.id], "%ch%cgHello there!%cn Welcome to the game!", {});
        return;
      }
      
      // Try to find the target player
      const targetName = args[1].trim();
      const target = await dbojs.queryOne({ 
        $or: [
          { "data.name": new RegExp(`^${targetName}$`, "i") },
          { "data.moniker": new RegExp(`^${targetName}$`, "i") }
        ],
        flags: /connected/i
      });
      
      if (!target) {
        send([ctx.socket.id], `%ch%crI don't see anyone named '${targetName}' here.%cn`, {});
        return;
      }
      
      // Send a greeting to the target player
      const targetPlayerName = target.data?.moniker || target.data?.name;
      
      // Message to the player who used the command
      send([ctx.socket.id], `%ch%cgYou wave hello to ${targetPlayerName}!%cn`, {});
      
      // Message to the target player
      send([`#${target.id}`], `%ch%cg${playerName} waves hello to you!%cn`, {});
      
      // Message to everyone else in the room
      send([`#${player.location}`], 
        `%ch%cg${playerName} waves hello to ${targetPlayerName}!%cn`, 
        {},
        [ctx.socket.id, target.id]
      );
    },
  }); 