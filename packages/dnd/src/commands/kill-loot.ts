/**
 * +kill — execute unconscious monsters (shared with auto-death).
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { roomIdOf } from "../combat/session.ts";
import { resolveCombatTarget } from "../combat/focus.ts";
import { executeMonsterKill } from "../combat/execute-kill.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

addCmd({
  name: "+kill",
  pattern: /^\+kill(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Dnd",
  help: `+kill [<target>]  — Execute unconscious monster for XP.

No arg uses combat focus. 0 HP monsters also auto-kill
on a finishing +attack.

Examples:
  +kill Orc
  +kill

See: +help kill`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const arg = u.cmd.args[0] ?? "";
    const { target: targetObj, error } = await resolveCombatTarget(
      u,
      roomId,
      arg,
    );
    if (!targetObj) {
      u.send(error || "No target.");
      return;
    }

    const raw = (targetObj.state as Any)?.dnd;
    if (!raw) {
      u.send("That target does not have a character sheet.");
      return;
    }
    const targetSheet = migrateSheet(raw);
    if (targetSheet.class !== "Monster") {
      u.send("You can only execute NPCs/Monsters.");
      return;
    }
    if ((targetSheet.hp?.current ?? 0) > 0) {
      u.send(
        `${u.util.displayName(targetObj, u.me)} is still ` +
          `standing! Reduce them to 0 HP first.`,
      );
      return;
    }

    const r = await executeMonsterKill(u, roomId, targetObj);
    if (!r.ok && r.message) u.send(r.message);
  },
});
