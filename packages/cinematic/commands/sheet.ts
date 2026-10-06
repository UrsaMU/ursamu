/** +sheet — Cinematic Unisystem character sheet. */
import { addCmd } from "@ursamu/mush";
import type { IDBObj } from "@ursamu/mush";
import { formatSheet } from "../src/display.ts";
import { readChar } from "../src/types.ts";

export function buildSheetCmd() {
  addCmd({
    name: "+sheet",
    pattern: /^\+sheet(?:\s+(.*))?$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+sheet [<player>]  — Show a Cinematic Unisystem sheet.

Examples:
  +sheet
  +sheet Bob`,
    exec: async (u) => {
      const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
      let target: IDBObj | undefined = u.me;
      if (arg) {
        target = await u.util.target(u.me, arg, true);
        if (!target) {
          u.send("No such player.");
          return;
        }
        if (target.id !== u.me.id) {
          const isStaff = u.me.flags.has("admin") ||
            u.me.flags.has("wizard");
          if (!isStaff) {
            u.send("Permission denied.");
            return;
          }
        }
      }
      const c = readChar(target.state);
      u.send(
        formatSheet(
          u.util.displayName(target, u.me),
          c,
        ),
      );
    },
  });
}
