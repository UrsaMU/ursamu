import { compare, hash } from "../../deps.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { setFlags } from "../utils/setFlags.ts";
import { joinChans } from "../utils/joinChans.ts";
import { moniker } from "../utils/moniker.ts";

export default () =>
  addCmd({
    name: "connect",
    pattern: /^connect\s+(.*)/i,
    lock: "!connected",
    exec: async (ctx, args) => {
      const pieces = args[0].split(" ");
      let name = "";
      let password = "";
      if (pieces.length === 2) {
        [name, password] = pieces;
      } else {
        password = pieces.pop() || "";
        name = pieces.join(" ");
      }
      
      // Trim the name to remove any whitespace
      name = name.trim();
      
      if (!name || !password) {
        send([ctx.socket.id], "You must provide both a name and password.", {
          error: true,
        });
        return;
      }

      console.log(`Attempting to connect with name: "${name}"`);
      
      // Get all players and find the matching one
      const allPlayers = await dbojs.query({});
      console.log(`Total players in database: ${allPlayers.length}`);
      
      // Find player with matching name (case insensitive)
      const found = allPlayers.find(player => 
        player.data?.name && player.data.name.toLowerCase() === name.toLowerCase()
      );
      
      if (!found) {
        console.log(`No player found with name: "${name}"`);
        send([ctx.socket.id], "I can't find a character by that name!", {
          error: true,
        });
        return;
      }

      console.log(`Found player: ${found.data?.name} with ID: ${found.id}`);

      if (!(await compare(password, found.data?.password || ""))) {
        console.log(`Password mismatch for player: ${found.data?.name}`);
        send([ctx.socket.id], "I can't find a character by that name!", {
          error: true,
        });
        return;
      }

      ctx.socket.cid = found.id;
      // Use type assertion to fix the join method error
      (ctx.socket as any).join(`#${found.id}`);
      (ctx.socket as any).join(`#${found.location}`);
      await setFlags(found, "connected");
      found.data ||= {};
      await dbojs.modify({ id: found.id }, "$set", found);
      await send([ctx.socket.id], `Welcome back, ${moniker(found)}.`, {
        cid: found.id,
      });

      // Send connection message to everyone in the location room except the connecting player
      await send(
        [`#${found.location}`],
        `${moniker(found)} has connected.`,
        {},
        [ctx.socket.id]  // Exclude the connecting player using socket ID
      );
      await force(ctx, "@mail/notify");
      await joinChans(ctx);
      await force(ctx, "look");
    },
  });
