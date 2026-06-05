import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findPageFile, normalisePath } from "../fs.ts";
import { subscriptions, MAX_PLAYER_SUBS } from "../db.ts";

// ─── +wikiwatch ───────────────────────────────────────────────────────────────

addCmd({
  name: "+wikiwatch",
  pattern: /^\+wikiwatch(?:\/(off))?\s*(.*)/i,
  lock: "connected",
  category: "Wiki",
  help: `+wikiwatch[/off] [<path>]  — Subscribe or unsubscribe to wiki page change notifications.

When someone edits a page you are watching, you receive an in-game notification.
Maximum 50 watchers per page.

Switches:
  /off <path>   Explicitly unsubscribe from a page.

Examples:
  +wikiwatch                    List your current wiki subscriptions.
  +wikiwatch news/battle-2026   Toggle watch on news/battle-2026.
  +wikiwatch/off news/battle    Unsubscribe from news/battle.`,

  exec: async (u: IUrsamuSDK) => {
    const sw      = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg     = (u.cmd.args[1] ?? "").trim();
    const forceOff = sw === "off";

    // No arg — list subscriptions
    if (!arg) {
      const subs = await subscriptions.find({ playerId: u.me.id });
      if (!subs.length) {
        u.send("%ch>Wiki:%cn You are not watching any pages.");
        return;
      }
      u.send(`%ch>Wiki:%cn You are watching ${subs.length} page(s):%cn`);
      for (const s of subs) u.send("  " + s.path);
      return;
    }

    const wikiPath = normalisePath(arg);

    // Verify the page exists
    const found = await findPageFile(wikiPath);
    if (!found) { u.send(`%ch>Wiki:%cn Page '${wikiPath}' not found.`); return; }

    const existing = await subscriptions.findOne({ playerId: u.me.id, path: wikiPath });

    if (existing) {
      // Already watching — unsubscribe (toggle or explicit /off)
      await subscriptions.delete({ id: existing.id });
      u.send(`%ch>Wiki:%cn You are no longer watching '%cc${wikiPath}%cn'.`);
      return;
    }

    if (forceOff) {
      u.send(`%ch>Wiki:%cn You were not watching '${wikiPath}'.`);
      return;
    }

    // Per-player cap: prevent a single player from watching unlimited pages
    const playerSubs = await subscriptions.find({ playerId: u.me.id });
    if (playerSubs.length >= MAX_PLAYER_SUBS) {
      u.send(`%ch>Wiki:%cn You have reached the maximum number of watched pages (${MAX_PLAYER_SUBS}).`);
      return;
    }

    // Check cap: max 50 watchers per page
    const allWatchers = await subscriptions.find({ path: wikiPath });
    if (allWatchers.length >= 50) {
      u.send("%ch>Wiki:%cn This page has reached the maximum number of watchers (50).");
      return;
    }

    await subscriptions.create({
      id:        crypto.randomUUID(),
      playerId:  u.me.id,
      path:      wikiPath,
      createdAt: Date.now(),
    });
    u.send(`%ch>Wiki:%cn Now watching '%cc${wikiPath}%cn'. You will be notified of changes.`);
  },
});
