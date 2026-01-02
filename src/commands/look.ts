
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { displayName } from "../utils/displayName.ts";
import { center, columns, ljust, repeatString, rjust } from "../utils/format.ts";
import { evaluateFormat } from "../utils/formatUtils.ts";
import { idle } from "../utils/idle.ts";
import { isAdmin } from "../utils/isAdmin.ts";
import { target } from "../utils/target.ts";
import { getAttribute } from "../utils/getAttribute.ts";
import { flags } from "../services/flags/flags.ts";

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

      if (!tar) {
        send([ctx.socket.id], "I can't find that here!", {});
        return;
      }

      const canSeeTar = await canEdit(en, tar);
      
      // Handle @nameformat
      let nameOutput = "";
      const nameFormat = await getAttribute(tar, "NAMEFORMAT")
      
      if (nameFormat) {
          nameOutput = await evaluateFormat(nameFormat.value, { enactor: en, target: tar });
      } else {
          nameOutput = center(
            `%cy[%cn %ch${displayName(en, tar, canSeeTar)}%cn %cy]%cn`,
            78,
            "%cr=%cn"
          );
      }

      let output = nameOutput + "\n";

      // Handle @descformat
      const descFormat = await getAttribute(tar, "DESCFORMAT");
      const baseDesc = tar.description || "You see nothing special.";

      if (descFormat) {
          output += await evaluateFormat(descFormat.value, { enactor: en, target: tar, args: [baseDesc] });
      } else {
          output += `${baseDesc}\n`;
      }
      
      output += "\n";

      // Handle @conformat / Contents
      const conFormat = await getAttribute(tar, "CONFORMAT");
      
      // OPAQUE check: If opaque and not canEdit, hide contents.
      // Typically OPAQUE on a room prevents looking OUT from inside, or looking IN from outside?
      // MUSH: OPAQUE on container hides contents. OPAQUE on room prevents looking at room from outside (if that's even possible usually) OR prevents looking at location from inside.
      // Here we treat it as hiding contents of the target object.
      
      let showContents = true;
      if (tar.flags.includes("opaque") && !(await canEdit(en, tar))) {
           showContents = false;
      }
      
      if (showContents) {
        const contents = await dbojs.query({ location: tar.id });
      const players = contents.filter(
        (c) => c.flags.includes("player") && c.flags.includes("connected")
      );
      // Other contents (things) are usually mixed in MUX but here we separate players?
      // UrsaMU currently lists Players mostly.
      // If CONFORMAT exists, we just print it.
      
      if (conFormat) {
          const evalCon = await evaluateFormat(conFormat.value, { enactor: en, target: tar });
          if (evalCon) output += evalCon + "\n";
      } else {
        // Standard Contents Listing (Players)
        if (players.length) {
            output += center(" %chCharacters%cn ", 78, "%cr-%cn");
            output += "\n";
    
            for (const p of players) {
              const canSeeP = await canEdit(en, p);
              output += isAdmin(p) ? "%ch%cc *%cn  " : "    ";
              output += ljust(`${displayName(en, p, canSeeP)}`, 25);
              // deno-lint-ignore no-explicit-any
              output += rjust(idle((p.data as any)?.lastCommand || 0), 5);
              output += ljust(
                `  ${
                  p.data?.shortdesc || "%ch%cxUse '+short <desc>' to set this.%cn"
                }`,
                42
              );
              output += "\n";
            }
            }
        }
      } // End showContents check
      
      const exitFormat = await getAttribute(tar, "EXITFORMAT");
      const exits = await Promise.all((
        await dbojs.query({
          "$and": [
            { flags: /exit/i },
            { location: tar.id }
          ]
        })
      ).map(async (e) => {
        if (!e.data?.name) return "";

        const parts = e.data.name?.split(";") || [];
        const canSeeE = await canEdit(en, e);
        const suffix = canSeeE ? `(#${e.id}${flags.codes(e.flags).toUpperCase()})` : "";
        return parts?.length > 1
          ? `<%cy${parts[1].toLocaleUpperCase()}%cn> ${parts[0]}${suffix}\n`
          : `${parts[0]}${suffix}\n`;
      }));
      
      if (exitFormat) {
          const evalExit = await evaluateFormat(exitFormat.value, { enactor: en, target: tar });
          if (evalExit) output += evalExit + "\n";
      } else {
          if (exits.length) {
            output += center(" %chExits%cn ", 78, "%cr-%cn");
            output += columns(exits, 80, 3);
          }
      }

      output += repeatString("%cr=%cn", 78);
      send([ctx.socket.id], output, {});
    },
  });
