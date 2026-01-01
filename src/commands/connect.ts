import { compare } from "../../deps.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { setFlags } from "../utils/setFlags.ts";
import { joinChans } from "../utils/joinChans.ts";
import { moniker } from "../utils/moniker.ts";
import { isNameTaken } from "../utils/isNameTaken.ts";

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

      console.log(`Attempting to connect with name/alias: "${name}"`);
      
      try {
        // Find player with matching name or alias (case insensitive)
        const found = await isNameTaken(name);
        
        if (!found) {
          console.log(`No player found with name/alias: "${name}"`);
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

        console.log(`Password verified for player: ${found.data?.name}`);

        // Set socket cid
        ctx.socket.cid = found.id;
        console.log(`Set socket.cid to: ${ctx.socket.id}`);
        
        // Join rooms
        try {
          ctx.socket.join(`#${found.id}`);
          console.log(`Joined room: #${found.id}`);
          
          if (found.location) {
            ctx.socket.join(`#${found.location}`);
            console.log(`Joined location room: #${found.location}`);
          } else {
            console.log(`Player has no location, skipping location room join`);
          }
        } catch (error) {
          console.error(`Error joining rooms:`, error);
        }
        
        // Set connected flag
        await setFlags(found, "connected");
        console.log(`Set connected flag for player: ${found.data?.name}`);
        
        // Ensure data object exists
        found.data ||= {};
        
        // Save player data
        await dbojs.modify({ id: found.id }, "$set", found);
        console.log(`Saved player data for: ${found.data?.name}`);
        
        // Send welcome message
        await send([ctx.socket.id], `Welcome back, ${moniker(found)}.`, {
          cid: found.id,
        });
        console.log(`Sent welcome message to player: ${found.data?.name}`);

        // Send connection message to everyone in the location room except the connecting player
        if (found.location) {
          await send(
            [`#${found.location}`],
            `${moniker(found)} has connected.`,
            {},
            [ctx.socket.id]  // Exclude the connecting player using socket ID
          );
          console.log(`Sent connection message to location: #${found.location}`);
        } else {
          console.log(`Player has no location, skipping connection message`);
        }
        
        // Check for mail
        await force(ctx, "@mail/notify");
        console.log(`Checked mail for player: ${found.data?.name}`);
        
        // Join channels
        await joinChans(ctx);
        console.log(`Joined channels for player: ${found.data?.name}`);
        
        // Force look command
        await force(ctx, "look");
        console.log(`Forced look command for player: ${found.data?.name}`);
        
        console.log(`Connect command completed successfully for: ${found.data?.name}`);
      } catch (error) {
        console.error(`Error in connect command:`, error);
        send([ctx.socket.id], "An error occurred while connecting. Please try again.", {
          error: true,
        });
      }
    },
  });
