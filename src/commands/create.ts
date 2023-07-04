import { hash } from "bcryptjs";
import { send } from "../services/broadcast/";
import { createCharacter } from "../services/characters/character";
import { addCmd, force } from "../services/commands";
import { dbojs } from "../services/Database";
import config from "../ursamu.config";

export default () =>
  addCmd({
    name: "create",
    pattern: /^create\s+(.*)/i,
    exec: async (ctx, args) => {
      const [name, password] = args[0].split(" ");

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

      const player = await dbojs.insert({
        id: (await dbojs.count({})) + 1,
        flags: "player connected",
        location: config.game.playerStart,
        data: {
          name,
          password: await hash(password, 10),
        },
      });

      ctx.socket.join(`#${player.id}`);
      ctx.socket.join(`#${player.location}`);

      ctx.socket.cid = player.id;
      player.data ||= {};
      player.data.lastCommand = Date.now();
      await dbojs.update({ id: player.id }, player);
      send([ctx.socket.id], `Welcome to the game, ${player.data?.name}!`, {
        cid: player.id,
      });
      force(ctx, "look");
    },
  });
