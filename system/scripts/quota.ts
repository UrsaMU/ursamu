import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @quota                    — show your current quota
 * @quota <player>=<n>       — admin: set a player's quota
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();
  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");

  if (!arg) {
    // Show own quota
    const quota = (actor.state.quota as number) ?? 0;
    u.send(`Your quota: ${quota} object${quota === 1 ? "" : "s"} remaining.`);
    return;
  }

  // Admin: @quota <player>=<n>
  if (!isAdmin) {
    u.send("Permission denied.");
    return;
  }

  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @quota <player>=<amount>");
    return;
  }

  const playerRef = arg.slice(0, eqIdx).trim();
  const newQuota = parseInt(arg.slice(eqIdx + 1).trim(), 10);

  if (isNaN(newQuota) || newQuota < 0) {
    u.send("Quota must be a non-negative integer.");
    return;
  }

  const results = await u.db.search(playerRef);
  const target = results[0];
  if (!target) {
    u.send(`I can't find a player called '${playerRef}'.`);
    return;
  }

  target.state.quota = newQuota;
  await u.db.modify(target.id, "$set", { data: target.state });
  u.send(`Quota for ${u.util.displayName(target, actor)} set to ${newQuota}.`);
};
