/**
 * @quota — show and manage builder quota.
 */

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";

addCmd({
  name: "@quota",
  pattern: /^@?quota(?:\/(list))?\s*(.*)?$/i,
  lock: "connected",
  category: "Building",
  help: `@quota                — Show your current quota.
@quota <player>=<n>   — Set a player's quota (admin+).
@quota/list           — List players with low quota (admin+).

EXAMPLES
  @quota
  @quota Alice=200
  @quota/list`,
  exec: async (u: IUrsamuSDK) => {
    const sw      = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg     = (u.cmd.args[1] ?? "").trim();
    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

    if (sw === "list") {
      if (!isAdmin) { u.send("Permission denied."); return; }
      const all = await u.db.search({ flags: /player/i });
      const low = all.filter((p) => ((p.state.quota as number) ?? 0) < 50);
      if (!low.length) { u.send("No players with low quota."); return; }
      u.send("%ch--- Low Quota Players ---%cn");
      for (const p of low) {
        u.send(`  ${u.util.displayName(p, u.me)} (#${p.id}): ${(p.state.quota as number) ?? 0}`);
      }
      u.send("%ch--------------------------%cn");
      return;
    }

    if (!arg) {
      const quota = (u.me.state.quota as number) ?? 0;
      u.send(`Your quota: %ch${quota}%cn object${quota === 1 ? "" : "s"} remaining.`);
      return;
    }

    if (!isAdmin) { u.send("Permission denied."); return; }
    const eq = arg.indexOf("=");
    if (eq === -1) { u.send("Usage: @quota <player>=<amount>"); return; }
    const playerRef = arg.slice(0, eq).trim();
    const newQuota  = parseInt(arg.slice(eq + 1).trim(), 10);
    if (isNaN(newQuota) || newQuota < 0) { u.send("Quota must be a non-negative integer."); return; }
    if (newQuota > 1000) { u.send("Quota cannot exceed 1000."); return; }
    const results = await u.db.search(playerRef);
    const target  = results[0];
    if (!target) { u.send(`I can't find player '${playerRef}'.`); return; }
    await u.db.modify(target.id, "$set", { "data.quota": newQuota });
    u.send(`Quota for ${u.util.displayName(target, u.me)} set to %ch${newQuota}%cn.`);
  },
});
