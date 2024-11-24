import { compare, hash } from "bcryptjs";
import { send } from "../services/broadcast";
import { addCmd, force } from "../services/commands";
import { dbojs } from "../services/Database";
import { setFlags } from "../utils/setFlags";
import { joinChans } from "../utils/joinChans";
import { moniker } from "../utils/moniker";

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
          $or: [
            { "data.name": { $regex: new RegExp(`^${name}$`, "i") } },
            { "data.alias": { $regex: new RegExp(`^${name}$`, "i") } },
          ],
        })
      )[0];

      if (!found) {
        send([ctx.socket.id], "I can't find a character by that name!", {
          error: true,
        });
        return;
      }

      if (!(await compare(password, found.data?.password || ""))) {
        send([ctx.socket.id], "I can't find a character by that name!", {
          error: true,
        });
        return;
      }

      ctx.socket.cid = found.id;
      ctx.socket.join(`#${found.id}`);
      ctx.socket.join(`#${found.location}`);
      await setFlags(found, "connected");
      found.data ||= {};

      // Update only the necessary fields, excluding _id
      const now = Date.now();
      found.data.lastLogin = now;
      found.lastCommand = now;  // Initialize lastCommand on connect

      const updateData = {
        flags: found.flags,
        location: found.location,
        data: found.data,
        lastCommand: found.lastCommand  // Include lastCommand in update
      };

      await dbojs.update({ id: found.id }, { $set: updateData });
      await send([ctx.socket.id], `Welcome back, ${moniker(found)}.`, {
        cid: found.id,
      });

      await send(
        [`#${found.location}`],
        `${moniker(found)} has connected.`,
        {},
      );
      await joinChans(ctx);
      await force(ctx, "@mail/notify");
      await force(ctx, "look");
    },
  });
