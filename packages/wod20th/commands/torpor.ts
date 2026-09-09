// commands/torpor.ts -- +torpor Kindred death-sleep.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  clearTorpor,
  isInTorpor,
  isKindred,
  maybeEnterTorpor,
} from "../core/kindred.ts";
import { healDamage, initTrack } from "../core/health.ts";
import { isIncapacitated } from "../core/wounds.ts";
import { frame } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+torpor",
  pattern: /^\+torpor(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+torpor[/switch] [<target>]  -- Kindred torpor.

SYNTAX
  +torpor                 Your torpor state.
  +torpor/rise <target>   (Staff) Pull Kindred from torpor.

NOTES
  Torpor sets when you hit Incapacitated with lethal/agg.
  While in torpor you cannot act (feed, Disciplines, etc.).

SEE ALSO: +help blood, +help beast, +help hurt`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "rise") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      if (!arg) {
        u.send("Usage: +torpor/rise <target>");
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
      // Clear incap: heal enough to free Incap slot.
      healDamage(char, "all", 7);
      if (!char.healthTrack || char.healthTrack.every((m) => m === "")) {
        char.healthTrack = initTrack();
      }
      clearTorpor(char);
      await saveChar(char);
      u.send(
        `%cg${u.util.displayName(target, u.me)} rises from torpor.%cn`,
      );
      poseRoom(
        u,
        `%cy${u.util.displayName(target, u.me)}%cn stirs from death-sleep.`,
      );
      return;
    }

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    if (!isKindred(char)) {
      u.send("Torpor is a Kindred condition.");
      return;
    }

    // Refresh flag if track says so.
    maybeEnterTorpor(char);
    if (char.inTorpor) await saveChar(char);

    if (isInTorpor(char)) {
      u.send(frame("Torpor", [
        "  %crYou lie in torpor.%cn",
        "  Staff may +torpor/rise you when the story allows.",
        isIncapacitated(char)
          ? "  Health: Incapacitated"
          : "  Health: recovering",
      ]));
      return;
    }

    u.send(frame("Torpor", [
      "  You are awake.",
      "  Torpor comes if you fall Incapacitated with lethal or agg.",
    ]));
  },
});
