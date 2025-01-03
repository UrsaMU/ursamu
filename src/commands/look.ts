import { getAttr, Obj } from "../services";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";
import { displayName } from "../utils/displayName";
import { center, columns, ljust, repeatString, rjust } from "../utils/format";
import { getIdle } from "../utils/idle";
import { target } from "../utils/target";

export default () =>
  addCmd({
    name: "look",
    pattern: /^l(?:ook)?(?:\s+(.*))?/i,
    lock: "connected",
    exec: async (ctx, args) => {
      // Force a fresh query with no caching
      const en = await dbojs.db.findOne({ id: ctx.socket.cid });
      if (!en) return;
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

      // Force fresh queries for contents
      const contents = await dbojs.db.find({ location: tar.id });
      const players = contents.filter(
        (c) => c.flags.includes("player") && c.flags.includes("connected"),
      );

      const exits = (
        await dbojs.find({
          $where: function () {
            return this.flags.includes("exit") && this.location === tar.id;
          },
        })
      ).map((e) => {
        if (!e.data?.name) return "";

        const parts = e.data.name?.split(";") || [];
        return parts?.length > 1
          ? `<%cy${parts[1].toLocaleUpperCase()}%cn> ${parts[0]}`
          : `${parts[0]}`;
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
