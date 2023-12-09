import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { getCharacter } from "../services/characters/character.ts";
import { addCmd } from "../services/commands/index.ts";

export default () =>
  addCmd({
    name: "shortdesc",
    lock: "connected",
    pattern: /^[@\+]?short\s+(.*)/i,
    exec: async (ctx, args) => {
      const en = await getCharacter(ctx.socket.cid);
      if (!en) return;

      en.data ||= {};
      en.data.shortdesc = args[0].trim();
      await dbojs.update({ id: en.id }, en);
      send([ctx.socket.id], `Your short description has been updated.`, {});
    },
  });
