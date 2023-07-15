import { hash } from "bcryptjs";
import { send } from "../services/broadcast/";
import { addCmd, force } from "../services/commands";
import { dbojs } from "../services/Database";
import config from "../ursamu.config";
import { getNextId } from "../utils/getNextId";
import { moniker } from "../utils/moniker";
import { joinChans } from "../utils/joinChans";

export default () =>
  addCmd({
    name: "create",
    pattern: /^create\s+(.*)/i,
    exec: async (ctx, args) => {
      const [name, password] = args[0].split(" ");
      const players = await dbojs.find({
        $where: function () {
          return this.flags.includes("player");
        },
      });
      const taken = await dbojs.find({
        $where: function () {
          return (
            this.data.name.toLowerCase() === name.toLowerCase() ||
            this.data?.alias?.toLowerCase() === name.toLowerCase()
          );
        },
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
      const player = await dbojs.insert({
        id,
        flags,
        location: config.game.playerStart,
        data: {
          name,
          password: await hash(password, 10),
        },
      });

      ctx.socket.join(`#${player.id}`);
      ctx.socket.join(`#${player.location}`);
      joinChans(ctx);
      ctx.socket.cid = player.id;
      player.data ||= {};
      player.data.lastCommand = Date.now();
      await dbojs.update({ id: player.id }, player);
      send([ctx.socket.id], `Welcome to the game, ${player.data?.name}!`, {
        cid: player.id,
      });
      send([`#${player.location}`], `${moniker(player)} has connected.`, {});
      force(ctx, "look");
    },
  });
