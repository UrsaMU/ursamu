import { hash } from "../../deps.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import config from "../ursamu.config.ts";
import { getNextId } from "../utils/getNextId.ts";
import { moniker } from "../utils/moniker.ts";
import { joinChans } from "../utils/joinChans.ts";

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

      const players = await dbojs.query({ flags: /player/i });
      const taken = await dbojs.query({
        $or: [{ "name": name }, { "alias": name }],
      });

      if (taken.length > 0) {
        send([ctx.socket.id], "That name is already taken or unavailable.", {
          error: true,
        });
        return;
      }

      const flags =
        players.length > 0 ? "player connected" : "player connected superuser";
      const id = await getNextId("objid");
      const player = await(async() => {
        await dbojs.create({
          id,
          flags,
          location: config.game?.playerStart,
          data: {
            name,
            home: config.game?.playerStart,
            password: await hash(password, 10),
          },
        });
        const ret = dbojs.query({id});
        return ret.length ? ret : false;
      })();
      if(!player) {
        send([ctx.socket.id], "Unable to create player!.", {
          error: true,
        });
        return;
      }

      ctx.socket.join(`#${player.id}`);
      ctx.socket.join(`#${player.location}`);
      ctx.socket.cid = player.id;
      player.data ||= {};
      player.data.lastCommand = Date.now();

      await dbojs.modify({ id: player.id }, "$set", player);
      await joinChans(ctx);

      send([ctx.socket.id], `Welcome to the game, ${player.data?.name}!`, {
        cid: player.id,
      });

      send([`#${player.location}`], `${moniker(player)} has connected.`, {});
      force(ctx, "look");
    },
  });
