import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: flags.ts
 * Sets or removes flags on an object.
 */
export default async (u: IUrsamuSDK) => {
  const raw = u.cmd.args.join(" ").trim();
  const eqIdx = raw.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @flags <target>=<flags>");
    return;
  }
  const targetName = raw.slice(0, eqIdx).trim();
  const flags = raw.slice(eqIdx + 1).trim();

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

  if (!(await u.canEdit(u.me, tar))) {
    u.send("Permission denied.");
    return;
  }

  await u.setFlags(tar.id, flags);
  u.send(`Flags set on ${u.util.displayName(tar, u.me)}.`);
};
