import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { target } from "../utils/target.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "moniker",
    pattern: /^[@\+]?moniker\s+(.*)\s*=\s*(.*)/i,
    lock: "connected admin+",
    exec: async (u: IUrsamuSDK) => {
      const player = await dbojs.queryOne({ id: u.me.id });
      if (!player) return;
      const tar = await target(player, u.cmd.args[0]);
      if (!tar) return u.send("I can't find that player.");

      const stripped = u.util.stripSubs(u.cmd.args[1]);
      tar.data ||= {};
      if (stripped.toLowerCase() !== String(tar.data.name || "").toLowerCase()) {
        u.send("You can't change someone's moniker to something that doesn't match their name.");
        return;
      }
      tar.data.moniker = u.cmd.args[1];
      await dbojs.modify({ id: tar.id }, "$set", tar);
      u.send(`You have set ${String(tar.data.name)}'s moniker to ${u.cmd.args[1]}.`);
    },
  });
