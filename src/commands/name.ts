import { dbojs } from "../services/Database/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { target } from "../utils/target.ts";
import { isNameTaken } from "../utils/isNameTaken.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "name",
    pattern: /^[@/+]?name\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const [name, newName] = u.cmd.args;
      const potential = await isNameTaken(newName?.trim());
      const tar = await target(en, name?.trim(), true);
      if (!tar) return u.send("I can't find that.");
      if (!await canEdit(en, tar)) return u.send("I can't find that.");
      if (
        potential &&
        newName.toLowerCase() !== String(tar.data?.name || "").toLowerCase()
      )
        return u.send("That name or alias is already taken.");

      tar.data ||= {};
      tar.data.name = newName;
      delete tar.data.moniker;
      await dbojs.modify({ id: tar.id }, "$set", { "data.name": newName, "data.moniker": null });
      u.send("Name set.");
    },
  });
};
