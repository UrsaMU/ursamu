import { IContext } from "../../@types/IContext.ts";
import { displayName } from "../../utils/displayName.ts";
import { moniker } from "../../utils/moniker.ts";
import { dbojs } from "../Database/index.ts";
import { send } from "../broadcast/index.ts";
import { flags } from "../flags/flags.ts";
import { force } from "./force.ts";

export const matchExits = async (ctx: IContext) => {
  if (ctx.socket.cid) {
    const en = await dbojs.queryOne({ id: ctx.socket.cid });
    if (!en) return false;

    en.data ||= {};
    const exits = await dbojs.query({
      $and: [{ flags: /exit/i }, { location: en.location }],
    });

    for (const exit of exits) {
      const reg = new RegExp(`^${exit.data?.name?.replace(/;/g, "|")}$`, "i");
      const match = ctx.msg?.trim().match(reg);

      const players = await dbojs.query({
        $and: [
          { location: en.location },
          { flags: /player/i },
          { flags: /connected/i },
          { id: { $ne: en.id } },
        ],
      });

      if (match) {
        const room = await dbojs.queryOne({ id: en.location });
        const dest = await dbojs.queryOne({ id: exit.data?.destination });

        if (dest && flags.check(en.flags, exit?.data?.lock || "")) {
          if (!en.flags.includes("dark")) {
            ctx.socket.leave(`${en.location}`);
            send(
              [`#${en.location}`],
              `${moniker(en)} leaves for ${dest.data?.name}.`,
              {}
            );
          }

          en.location = dest?.id;
          await dbojs.modify({ id: en.id }, "$set", en);
          ctx.socket.join(`#${en.location}`);

          if (!en.flags.includes("dark")) {
            send(
              [`#${en.location}`],
              `${en.data.name} arrives from ${room?.data?.name}.`,
              {}
            );
          }

          force(ctx, "look");
          return true;
        } else {
          send([ctx.socket.id], "You can't go that way.");

          if (players.length > 0) {
            send(
              players.map((p) => `#${p.id}`),
              `${moniker(en)} tries to go ${exit.data?.name}, but fails.`
            );
          }
          return true;
        }
      }
    }
  }

  return false;
};
