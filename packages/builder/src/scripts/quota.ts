import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @quota                     — show your current quota
 * @quota <player>=<n>        — admin: set a player's quota
 * @quota/list                — admin: list all players with quota below 50
 *
 * Switches:
 *   /list   Show all players with low quota (admin only).
 *
 * Examples:
 *   @quota
 *   @quota Alice=200
 *   @quota/list
 */
export default async (u: IUrsamuSDK) => {
  const actor   = u.me;
  const arg     = (u.cmd.args[0] || "").trim();
  const swtch   = (u.cmd.switches?.[0] || "").toLowerCase();
  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");

  // @quota/list — admin only
  if (swtch === "list") {
    if (!isAdmin) { u.send("Permission denied."); return; }
    const all = await u.db.search({ flags: /player/i });
    const low = all.filter(p => ((p.state.quota as number) ?? 0) < 50);
    if (low.length === 0) { u.send("No players with low quota."); return; }
    u.send("%ch--- Low Quota Players ---%cn");
    for (const p of low) {
      u.send(`  ${u.util.displayName(p, actor)} (#${p.id}): ${(p.state.quota as number) ?? 0}`);
    }
    u.send("%ch--------------------------%cn");
    return;
  }

  if (!arg) {
    // Show own quota
    const quota = (actor.state.quota as number) ?? 0;
    u.send(`Your quota: %ch${quota}%cn object${quota === 1 ? "" : "s"} remaining.`);
    return;
  }

  // Admin: @quota <player>=<n>
  if (!isAdmin) { u.send("Permission denied."); return; }

  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @quota <player>=<amount>"); return; }

  const playerRef = arg.slice(0, eqIdx).trim();
  const newQuota  = parseInt(arg.slice(eqIdx + 1).trim(), 10);

  if (isNaN(newQuota) || newQuota < 0) { u.send("Quota must be a non-negative integer."); return; }
  if (newQuota > 1000) { u.send("Quota cannot exceed 1000."); return; }

  const results = await u.db.search(playerRef);
  const target  = results[0];
  if (!target) { u.send(`I can't find a player called '${playerRef}'.`); return; }

  await u.db.modify(target.id, "$set", { "data.quota": newQuota });
  u.send(`Quota for ${u.util.displayName(target, actor)} set to %ch${newQuota}%cn.`);
};
