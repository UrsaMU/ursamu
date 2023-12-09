import { compare, hash } from "../../deps.ts";
import { send } from "../services/broadcast";
import { addCmd, force } from "../services/commands";
import { dbojs } from "../services/Database";
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

      const found = (
        await dbojs.find({
          $where: function () {
            return (
              this.data.name?.toLowerCase() === name?.toLowerCase() ||
              this.data.alias?.toLowerCase() === name?.toLowerCase()
            );
          },
        })
      )[0];
      if (!found) {
        send([ctx.socket.id], "I can't find a character by that name!", {
          error: true,
        });
        return;
      }

      if (!(await compare(password, found.data?.password || ""))) {
        send([ctx.socket.id], "I csn't find a character by that name!", {
          error: true,
        });
        return;
      }

      ctx.socket.cid = found.id;
      ctx.socket.join(`#${found.id}`);
      ctx.socket.join(`#${found.location}`);
      await setFlags(found, "connected");
      found.data ||= {};
      await dbojs.update({ id: found.id }, found);
      await send([ctx.socket.id], `Welcome back, ${moniker(found)}.`, {
        cid: found.id,
      });

      await send(
        [`#${found.location}`],
        `${moniker(found)} has connected.`,
        {}
      );
      await force(ctx, "@mail/notify");
      await joinChans(ctx);
      await force(ctx, "look");
    },
  });
