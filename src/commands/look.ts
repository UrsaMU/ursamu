import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { displayName } from "../utils/displayName.ts";
import { center, columns, ljust, repeatString, rjust } from "../utils/format.ts";
import { idle } from "../utils/idle.ts";
import { isAdmin } from "../utils/isAdmin.ts";
import { target } from "../utils/target.ts";

export default () =>
  addCmd({
    name: "look",
    pattern: /^l(?:ook)?(?:\s+(.*))?/i,
    lock: "connected",
    exec: async (ctx, args) => {
      if (!ctx.socket.cid) return;
      const query = await dbojs.query({ id: ctx.socket.cid });
      if (!query.length) return;
      const en = query[0];
      const tar = await target(en, args[0]);
      if (!tar) return;
      const obj = new Obj(tar);

      if (!tar) {
        send([ctx.socket.id], "I can't find that here!", {});
        return;
      }

      let output = center(
        `%cy[%cn %ch${displayName(en, tar)}%cn %cy]%cn`,
        78,
        "%cr=%cn",
      );

      output += `\n${await getAttr(
        obj,
        "description",
        "You see nothing special.",
      )}\n`;

      const contents = await dbojs.query({ location: tar.id });
      const players = contents.filter(
        (c) => c.flags.includes("player") && c.flags.includes("connected"),
      );

      const exits = (
        await dbojs.query({
          "$and": [
            { flags: /exit/i },
            { location: tar.id }
          ]
        })
      ).map((e) => {
        if (!e.data?.name) return "";

        const parts = e.data.name?.split(";") || [];
        return parts?.length > 1
          ? `<%cy${parts[1].toLocaleUpperCase()}%cn> ${parts[0]}\n`
          : `${parts[0]}\n`;
      });

      if (players.length) {
        output += center(" %chCharacters%cn ", 78, "%cr-%cn");
        output += "\n";

        for (const p of players) {
          // Get fresh data for each player
          const freshPlayer = await dbojs.db.findOne({ id: p.id });
          if (!freshPlayer) continue;
          const obj = new Obj(freshPlayer);

          const idleTime = await getIdle(freshPlayer.id);
          output += ljust(` ${displayName(en, freshPlayer)}`, 25);
          output += rjust(idleTime, 5);
          output += ljust(
            `  ${await getAttr(
              obj,
              "short-desc",
              "%ch%cxUse '&short-desc me=<desc>' to set this.%cn",
            )}`,
            48,
          );
          output += "\n";
        }
      }

      if (exits.length) {
        output += center(" %chExits%cn ", 78, "%cr-%cn");
        output += columns(exits, 80, 3);
      }

      output += repeatString("%cr=%cn", 78);
      send([ctx.socket.id], output, {});
    },
  });
