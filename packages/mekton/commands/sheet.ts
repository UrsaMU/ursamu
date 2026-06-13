import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";
import { chars } from "../schema.ts";
import { formatSheet } from "../display.ts";

addCmd({
  name: "+sheet",
  pattern: /^\+sheet(?:\s+(.*))?/i,
  lock: "connected",
  category: "General",
  help: `+sheet [<player>]  — Display a character sheet.

Admin can view other players' sheets.

Examples:
  +sheet             View your own sheet.
  +sheet Alice       View Alice's sheet (admin only).`,
  exec: async (u: IUrsamuSDK) => {
    const targetArg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    let playerId = u.me.id;
    let playerLabel = "your";

    if (targetArg) {
      const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      if (!isAdmin) { u.send("You may only view your own sheet."); return; }
      const target = await u.util.target(u.me, targetArg, true);
      if (!target) { u.send(`Player "${targetArg}" not found.`); return; }
      playerId = target.id;
      playerLabel = `${target.name}'s`;
    }

    const char = await chars.findOne({ playerId });
    if (!char) { u.send(`No character found for ${playerLabel === "your" ? "you" : playerLabel} character.`); return; }

    u.send(formatSheet(u, char));
  },
});
