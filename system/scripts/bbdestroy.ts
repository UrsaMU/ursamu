import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @bbdestroy <board>
 * Destroy a bulletin board and all its posts. Admin/wizard only.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) {
    u.send("Usage: @bbdestroy <board>");
    return;
  }

  const boardId = arg.toLowerCase().replace(/\s+/g, "-");
  await u.bb.destroyBoard(boardId);
  u.send(`Board '${boardId}' and all its posts have been deleted.`);
};
