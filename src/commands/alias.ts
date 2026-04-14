import { addCmd } from "../services/commands/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function execAlias(u: IUrsamuSDK): Promise<void> {
  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");
  const name = eqIdx === -1 ? input : input.slice(0, eqIdx).trim();
  const aliasVal = eqIdx === -1 ? "" : input.slice(eqIdx + 1).trim();

  const tar = await u.util.target(u.me, name, true);
  if (!tar) { u.send("I can't find that object."); return; }

  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }

  if (aliasVal) {
    const takenAlias = await u.db.search({ "data.alias": new RegExp(`^${escapeRegex(aliasVal)}$`, "i") });
    const takenName  = await u.db.search({ "data.name":  new RegExp(`^${escapeRegex(aliasVal)}$`, "i") });
    if (takenAlias.length > 0 && takenAlias[0].id !== tar.id) { u.send("That alias is already taken."); return; }
    if (takenName.length  > 0 && takenName[0].id  !== tar.id) { u.send("That name is already taken.");  return; }
    await u.db.modify(tar.id, "$set", { "data.alias": aliasVal });
    u.send(`Alias for ${tar.name} set to ${aliasVal}.`);
  } else {
    await u.db.modify(tar.id, "$unset", { "data.alias": 1 });
    u.send(`Alias for ${tar.name} removed.`);
  }
}

export default () => {
  addCmd({
    name: "@alias",
    pattern: /^[@/+]?alias\s+(.*)/i,
    lock: "connected",
    help: `@alias <target>=<alias>  — Set or clear an alias for an object.

Examples:
  @alias lamp=lantern
  @alias lamp=`,
    exec: execAlias,
  });
};
