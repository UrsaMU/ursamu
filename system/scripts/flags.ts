import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: flags.ts
 * Sets or removes flags on an object.
 */
export default async (u: IUrsamuSDK) => {
  const targetName = u.cmd.args[0];
  const flags = u.cmd.args[1];

  if (!targetName || !flags) {
    u.send("Usage: @flags <target>=<flags>");
    return;
  }

  if (!u.util.target) {
    u.send("Error: Internal SDK error (target utility missing).");
    return;
  }

  const tar = await u.util.target(u.me, targetName);

  if (!tar) {
    u.send("I can't find that here.");
    return;
  }

  if (!u.canEdit(u.me, tar)) {
    u.send("Permission denied.");
    return;
  }

  await u.setFlags(tar.id, flags);
  u.send(`Flags set on ${u.util.displayName(tar, u.me)}.`);
};
