import { addCmd } from "../services/commands/index.ts";
import { isNameTaken } from "../utils/isNameTaken.ts";
import { dbojs } from "../services/Database/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@alias",
    pattern: /^[@/+]?alias\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    help: "Set an alias",
    exec: async (u: IUrsamuSDK) => {
      const [name, alias] = u.cmd.args;
      const tar = await u.util.target(u.me, name, true);
      if (!tar) return u.send("I can't find that object.");

      if (alias) {
        const taken = await isNameTaken(alias);
        if (taken && taken.id !== tar.id)
          return u.send("That name or alias is already taken.");
      }

      await dbojs.modify({ id: tar.id }, "$set", { data: { ...tar.state, alias } });
      u.send(`Alias for ${String(tar.state.name || tar.id)} set to %ch${alias}%cn`);
    },
  });
};
