import { hash } from "../../deps.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getConfig } from "../services/Config/mod.ts";
import { getNextId } from "../utils/getNextId.ts";
import { moniker } from "../utils/moniker.ts";
import { joinChans } from "../utils/joinChans.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { isNameTaken } from "../utils/isNameTaken.ts";

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
      
      const nameExists = await isNameTaken(name);
      
      if (nameExists) {
        console.log(`Player with name "${name}" already exists or name is taken as alias!`);
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
      const startRoom = await dbojs.queryOne({ id: String(getConfig<string | number>("game.playerStart") || "") });
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
            money: 100,
            quota: 20
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
      ctx.socket.join(`#${player.id}`);
      ctx.socket.join(`#${player.location}`);
      ctx.socket.cid = player.id;
      await send([ctx.socket.id], `Welcome to ${getConfig<string>("game.name")}!`, {
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
