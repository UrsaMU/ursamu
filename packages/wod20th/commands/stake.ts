// commands/stake.ts -- +stake / +stake/pull heart paralysis.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import { applyStake, pullStake, isStaked } from "../core/stake.ts";
import { isKindred } from "../core/kindred.ts";
import { frame } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+stake",
  pattern: /^\+stake(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+stake[/pull] <target>  -- Heart-stake Kindred.

SYNTAX
  +stake <target>       Staff: stake through the heart.
  +stake/pull <target>  Staff: remove the stake.
  +stake                Your stake status.

NOTES
  Staked Kindred cannot act (like torpor) until pulled.

EXAMPLES
  +stake Alice
  +stake/pull Alice

SEE ALSO: +help torpor, +help attack, +help beast`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw && !arg) {
      const char = await findByPlayer(u.me.id);
      if (!char || !isKindred(char)) {
        u.send("Only Kindred track stake status.");
        return;
      }
      u.send(frame("Stake", [
        isStaked(char)
          ? "  %crYou are staked through the heart.%cn"
          : "  You are free of any stake.",
      ]));
      return;
    }

    if (!isStaff(u)) {
      u.send("%crPermission denied.%cn Staff apply stakes.");
      return;
    }
    if (!arg) {
      u.send(`Usage: +stake${sw === "pull" ? "/pull" : ""} <target>`);
      return;
    }
    const target = await u.util.target(u.me, arg, true);
    if (!target) {
      u.send("Target not found.");
      return;
    }
    if (!(await u.canEdit(u.me, target))) {
      u.send("%crPermission denied.%cn");
      return;
    }
    const char = await findByPlayer(target.id);
    if (!char || !isKindred(char)) {
      u.send("Target is not Kindred.");
      return;
    }
    const name = u.util.displayName(target, u.me);

    if (sw === "pull") {
      const r = pullStake(char);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(char);
      await unsetCharFields(char.id, ["staked"]);
      u.send(`%cg${name}: ${r.message}%cn`);
      poseRoom(u, `%cy${name}%cn is freed from the stake.`);
      return;
    }

    const r = applyStake(char);
    if (!r.ok) {
      u.send(`%cr${r.message}%cn`);
      return;
    }
    await saveChar(char);
    u.send(`%cr${name}: ${r.message}%cn`);
    poseRoom(u, `%cr${name}%cn is staked through the heart!`);
    u.send(
      "%crWood pierces your heart. You cannot move.%cn",
      target.id,
    );
  },
});
