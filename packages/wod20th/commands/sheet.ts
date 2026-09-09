// commands/sheet.ts -- +sheet [target]
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer } from "../db/charDb.ts";
import { formatSheet } from "../core/renderer.ts";
import { emitSheetViewed } from "../hooks.ts";

addCmd({
  name: "+sheet",
  pattern: /^\+sheet(?:\s+(.+))?/i,
  lock: "connected",
  category: "Character Generation",
  help: `+sheet [<target>]  -- Display a character sheet.

  With no argument, shows your own sheet.
  Viewing another player's sheet requires staff access.

SYNTAX
  +sheet [<target>]

EXAMPLES
  +sheet            Show your own sheet.
  +sheet Alice      Show Alice's sheet (staff only).`,

  exec: async (u: IUrsamuSDK) => {
    const rawArg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

    let targetId = u.me.id;
    let targetName = u.util.displayName(u.me, u.me);

    if (rawArg) {
      if (!isStaff) {
        u.send("Only staff may view other characters' sheets.");
        return;
      }
      const target = await u.util.target(u.me, rawArg, true);
      if (!target) { u.send("Target not found."); return; }
      targetId = target.id;
      targetName = u.util.displayName(target, u.me);
    }

    const char = await findByPlayer(targetId);
    if (!char) {
      u.send(`${rawArg ? targetName : "You"} ${rawArg ? "has" : "have"} no character on file.`);
      return;
    }

    emitSheetViewed({
      viewerId: u.me.id,
      targetId,
      charId: char.id,
      isStaff,
    });

    u.send(await formatSheet(char, isStaff, targetName));
  },
});
