import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: unlink.ts
 * Migrated from legacy @unlink command.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const targetName = u.cmd.args.join(" ").trim();

  if (!targetName) {
    u.send("Usage: @unlink <target>");
    return;
  }

  const searchTarget = await u.db.search(targetName);
  const target = searchTarget[0];

  if (!target) {
    u.send(`Could not find target: ${targetName}`);
    return;
  }

  if (!u.canEdit(actor, target)) {
    u.send("Permission denied.");
    return;
  }

  if (target.flags.has("room")) {
    await u.db.modify(target.id, "$unset", { "data.dropto": "" });
    u.send(`You unlink ${u.util.displayName(target, actor)}.`);
  } else if (target.flags.has("exit")) {
    await u.db.modify(target.id, "$unset", { "data.destination": "" });
    u.send(`You unlink ${u.util.displayName(target, actor)}.`);
  } else {
    u.send("You can only unlink rooms or exits.");
  }
};
