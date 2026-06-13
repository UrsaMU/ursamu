import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @unlink <target>
 *
 * Removes the link from a room (dropto) or exit (destination).
 * Players and things cannot be unlinked with this command.
 *
 * Examples:
 *   @unlink here
 *   @unlink North;N
 */
export default async (u: IUrsamuSDK) => {
  const actor      = u.me;
  const targetName = (u.cmd.args[0] || "").trim();

  if (!targetName) {
    u.send("Usage: @unlink <target>");
    return;
  }

  const results = await u.db.search(targetName);
  const target  = results[0];
  if (!target) { u.send(`Could not find target: ${targetName}`); return; }
  if (!(await u.canEdit(actor, target))) { u.send("Permission denied."); return; }

  if (target.flags.has("room")) {
    await u.db.modify(target.id, "$unset", { "data.dropto": 1 });
    u.send(`You unlink ${u.util.displayName(target, actor)}.`);
  } else if (target.flags.has("exit")) {
    await u.db.modify(target.id, "$unset", { "data.destination": 1 });
    u.send(`You unlink ${u.util.displayName(target, actor)}.`);
  } else {
    u.send("You can only unlink rooms or exits.");
  }
};
