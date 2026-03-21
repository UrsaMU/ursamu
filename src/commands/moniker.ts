import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { target } from "../utils/target.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "moniker",
    pattern: /^[@\+]?moniker\s+(.*)\s*=\s*(.*)/i,
    lock: "connected & admin+",
    exec: async (u: IUrsamuSDK) => {
      const player = await dbojs.queryOne({ id: u.me.id });
      if (!player) return;
      const tar = await target(player, u.cmd.args[0]);
      if (!tar) return u.send("I can't find that player.");

      const monikerVal = (u.cmd.args[1] || "").trim();
      const stripped = u.util.stripSubs(monikerVal);
      tar.data ||= {};
      if (stripped.toLowerCase() !== String(tar.data.name || "").toLowerCase()) {
        u.send("You can't change someone's moniker to something that doesn't match their name.");
        return;
      }
      tar.data.moniker = monikerVal;
      await dbojs.modify({ id: tar.id }, "$set", { "data.moniker": monikerVal });
      u.send(`You have set ${String(tar.data.name)}'s moniker to ${monikerVal}.`);
    },
  });
