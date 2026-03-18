import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @wipe <object>
 * Remove all user-set attributes from an object.
 * You must be able to edit the object (owner, admin, or wizard).
 */
export default async (u: IUrsamuSDK) => {
  const arg = (u.cmd.args[0] || "").trim();

  if (!arg) {
    u.send("Usage: @wipe <object>");
    return;
  }

  const results = await u.db.search(arg);
  const target = results[0];
  if (!target) {
    u.send(`I can't find '${arg}'.`);
    return;
  }

  if (!u.canEdit(u.me, target)) {
    u.send("Permission denied.");
    return;
  }

  const attrs = (target.state.attributes as unknown[]) || [];
  if (attrs.length === 0) {
    u.send(`${target.name || target.id} has no attributes to wipe.`);
    return;
  }

  await u.db.modify(target.id, "$set", { "data.attributes": [] });
  u.send(`Wiped ${attrs.length} attribute${attrs.length === 1 ? "" : "s"} from ${target.name || target.id}.`);
};
