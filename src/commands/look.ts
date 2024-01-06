import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { displayName } from "../utils/displayName.ts";
import {
  center,
  columns,
  ljust,
  repeatString,
  rjust,
} from "../utils/format.ts";
import { idle } from "../utils/idle.ts";
import { isAdmin } from "../utils/isAdmin.ts";
import { target } from "../utils/target.ts";

export default () =>
  addCmd({
    name: "look",
    pattern: /^l(?:ook)?(?:\s+(.*))?/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const query = await dbojs.query({ id: ctx.socket.cid });
      if (!query.length) return;
      const en = query[0];
      const tar = await target(en, args[0]);

      if (!tar) {
        send([ctx.socket.id], "I can't find that here!", {});
        return;
      }

      let output = center(
        `%cy[%cn %ch${displayName(en, tar)}%cn %cy]%cn`,
        78,
        "%cr=%cn",
      );

      output += `\n${tar.description || "You see nothing special."}\n`;

      const contents = await dbojs.query({ location: tar.id });
      const players = contents.filter(
        (c) => c.flags.includes("player") && c.flags.includes("connected"),
      );

      const exits = (
        await dbojs.query({
          "$and": [
            { flags: /exit/i },
            { location: tar.id },
          ],
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

        players.forEach((p) => {
          output += isAdmin(p) ? "%ch%cc *%cn  " : "    ";
          output += ljust(`${displayName(en, p)}`, 25);
          output += en.id === p.id
            ? rjust(idle(Date.now()), 5)
            : rjust(idle(p.data?.lastCommand || 0), 5);
          output += ljust(
            `  ${
              p.data?.shortdesc || "%ch%cxUse '+short <desc>' to set this.%cn"
            }`,
            42,
          );
          output += "\n";
        });
      }

      if (exits.length) {
        output += center(" %chExits%cn ", 78, "%cr-%cn");
        output += columns(exits, 78, 3).trim() + "%r";
      }

      output += repeatString("%cr=%cn", 78);
      send([ctx.socket.id], output, {});
    },
  });
