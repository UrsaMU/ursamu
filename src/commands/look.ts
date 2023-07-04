import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";
import { displayName } from "../utils/displayName";
import { center, ljust, repeatString, rjust } from "../utils/format";
import { idle } from "../utils/idle";
import { isAdmin } from "../utils/isAdmin";
import { target } from "../utils/target";

export default () =>
  addCmd({
    name: "look",
    pattern: /^l(?:ook)?(?:\s+(.*))?/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;
      const tar = await target(en, args[0]);

      if (!tar) {
        send([ctx.socket.id], "I can't find that here!", {});
        return;
      }

      let output = center(
        `%cy[%cn %ch${displayName(en, tar)}%cn %cy]%cn`,
        78,
        "%cr=%cn"
      );

      output += `\n${tar.description || "You see nothing special."}\n`;

      const contents = await dbojs.find({ location: tar.id });
      const players = contents.filter(
        (c) => c.flags.includes("player") && c.flags.includes("connected")
      );

      if (players.length) {
        output += center("%cy[%cn %chCharacters%cn %cy]%cn", 78, "%cr-%cn");
        output += "\n";

        players.forEach((p) => {
          output += isAdmin(p) ? "%ch%cc *%cn  " : "   ";
          output += ljust(`${displayName(en, p)}`, 25);
          output += rjust(idle(p.data?.lastCommand || 0), 5);
          output += ljust(
            `${
              p.data?.shortdesc ||
              "%b%b%ch%cxUse '+shortdesc <desc>' to set this.%cn"
            }`,
            40
          );
          output += "\n";
        });
      }
      output += repeatString("%cr=%cn", 78);
      send([ctx.socket.id], output, {});
    },
  });
