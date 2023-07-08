import { compare, hash } from "bcryptjs";
import { send } from "../services/broadcast";
import { addCmd, force } from "../services/commands";
import { dbojs } from "../services/Database";
import { setFlags } from "../utils/setFlags";
import { joinChans } from "../utils/joinChans";

export default () =>
  addCmd({
    name: "connect",
    pattern: /^connect\s+(.*)/i,
    lock: "!connected",
    exec: async (ctx, args) => {
      const [name, password] = args[0].split(" ");
      const found = (
        await dbojs.find({
          $where: function () {
            return this.data.name.toLowerCase() === name.toLowerCase();
          },
        })
      )[0];
      if (!found) {
        send([ctx.socket.id], "Not found!", {
          error: true,
        });
        return;
      }

      if (!(await compare(password, found.data?.password || ""))) {
        send([ctx.socket.id], "Permisson denied.", {
          error: true,
        });
        return;
      }

      ctx.socket.cid = found.id;
      console.log(ctx.socket.cid);
      ctx.socket.join(`#${found.id}`);
      ctx.socket.join(`#${found.location}`);
      await setFlags(found, "connected");
      found.data ||= {};
      found.data.lastCommand = Date.now();
      await dbojs.update({ id: found.id }, found);
      send([ctx.socket.id], `Welcome to the game, ${found.data?.name}!`, {
        cid: found.id,
      });
      await joinChans(ctx);
      await force(ctx, "look");
    },
  });
