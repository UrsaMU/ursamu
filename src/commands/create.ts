import { hash } from "../../deps.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import config from "../ursamu.config.ts";
import { getNextId } from "../utils/getNextId.ts";
import { moniker } from "../utils/moniker.ts";
import { joinChans } from "../utils/joinChans.ts";
import { IDBOBJ } from "../@types/IDBObj.ts";

export default () =>
  addCmd({
    name: "create",
    pattern: /^create\s+(.*)/i,
    exec: async (ctx, args) => {
      // if there are only two args, then it's name and password, but
      // if there are three, then it's a two or three word, etc name
      // with a password at the end.

      let name = "";
      let password = "";
      const pieces = args[0].split(" ");
      if (pieces.length < 2) {
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

      console.log(`Checking if player exists with name: "${name}"`);
      
      // First check for exact match (case insensitive)
      const allPlayers = await dbojs.query({});
      console.log(`Total players in database: ${allPlayers.length}`);
      
      // Log all player names for debugging
      for (const player of allPlayers) {
        if (player.data?.name) {
          console.log(`Existing player: ${player.data.name}`);
        }
      }
      
      // Manual check for existing player with same name (case insensitive)
      const nameExists = allPlayers.some(player => 
        player.data?.name && player.data.name.toLowerCase() === name.toLowerCase()
      );
      
      if (nameExists) {
        console.log(`Player with name "${name}" already exists!`);
        send([ctx.socket.id], "That name is already taken or unavailable.", {
          error: true,
        });
        return;
      }

      const players = await dbojs.query({ flags: /player/i });
      const flags =
        players.length > 0 ? "player connected" : "player connected superuser";
      const id = await getNextId("objid");

      // Get the starting room - fix the type issue with a non-null assertion
      const startRoom = await dbojs.queryOne({ id: config.game?.playerStart || "" });
      if (!startRoom) {
        send([ctx.socket.id], "Error: Starting room not found!", {
          error: true,
        });
        return;
      }

      const player = await(async() => {
        const newPlayer: IDBOBJ = {
          id,
          flags,
          location: startRoom.id,
          data: {
            name,
            home: startRoom.id,
            password: await hash(password, 10),
          },
        };
        await dbojs.create(newPlayer);
        return await dbojs.queryOne({id});
      })();
      if(!player) {
        send([ctx.socket.id], "Unable to create player!.", {
          error: true,
        });
        return;
      }

      console.log(`Successfully created player: ${name} with ID: ${player.id}`);

      // Use type assertion to fix the join method error
      (ctx.socket as any).join(`#${player.id}`);
      (ctx.socket as any).join(`#${player.location}`);
      ctx.socket.cid = player.id;
      await send([ctx.socket.id], `Welcome to ${config.game?.name}!`, {
        cid: player.id,
      });
      
      // Send connection message to everyone in the room except the new player
      await send(
        [`#${player.location}`],
        `${moniker(player)} has connected.`,
        {},
        [ctx.socket.id]  // Exclude the connecting player using socket ID
      );
      
      await joinChans(ctx);
      await force(ctx, "look");
    },
  });
