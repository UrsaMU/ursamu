/**
 * +focus — sticky combat target for +attack / +kill.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  clearFocus,
  readFocus,
  setFocus,
} from "../combat/focus.ts";
import { roomIdOf } from "../combat/session.ts";

addCmd({
  name: "+focus",
  pattern: /^\+focus(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+focus [<target>]  — Set or show combat focus.

+attack / +kill with no arg use your focus.
Look at a mob and tap Focus on web.

Examples:
  +focus Skeleton
  +focus
  +focus clear`,
  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const low = raw.toLowerCase();

    if (low === "clear" || low === "none") {
      await clearFocus(u);
      u.send("Focus cleared.");
      return;
    }

    if (!raw) {
      const f = readFocus(u.me);
      if (!f.focusId) {
        u.send("No focus. +focus <name> or look at a foe.");
        return;
      }
      u.send(
        `Focus: %ch${f.focusName || f.focusId}%cn ` +
          `(#${f.focusId}). +attack to strike.`,
      );
      return;
    }

    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const t = await u.util.target(u.me, raw);
    if (!t || t.location !== roomId) {
      u.send("That target is not here.");
      return;
    }
    await setFocus(u, t);
    const name = u.util.displayName(t, u.me).split(";")[0];
    u.send(
      `Focus: %ch${name}%cn. ` +
        `+attack / +kill with no name uses this target.`,
    );
  },
});
