// commands/feed.ts -- +feed vessel or Herd (scene feeding).

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { feedFromVessel, feedFromHerd } from "../core/feed.ts";
import { isKindred } from "../core/kindred.ts";
import { emitPoolRegained, emitHealthChanged } from "../hooks.ts";
import { frame } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";

function parsePositiveInt(s: string): number | null {
  if (!/^\d+$/.test(s.trim())) return null;
  const n = parseInt(s, 10);
  return n > 0 ? n : null;
}

addCmd({
  name: "+feed",
  pattern: /^\+feed(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+feed[/herd] [<target>] [=n]  -- Drink blood.

SYNTAX
  +feed <target> [=n]   Feed on a vessel (n BP, default 1).
  +feed/herd [=n]       Feed from Herd background.
  +feed                 Show Herd dots + tip.

NOTES
  Vessel takes 1 lethal per BP (mortals). Kindred lose BP.
  +blood/feed remains a quick regain without a vessel.

EXAMPLES
  +feed Alice
  +feed Alice=2
  +feed/herd
  +feed/herd=3

SEE ALSO: +help blood, +help bond, +help humanity`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    if (!isKindred(char)) {
      u.send("Only Kindred feed on blood.");
      return;
    }

    if (!sw && !rest) {
      const herd = char.backgrounds?.Herd ?? 0;
      u.send(frame("Feed", [
        `  Blood:  ${char.bloodPool ?? 0}/${char.bloodMax ?? 0}`,
        `  Herd:   ${herd}`,
        "  %cx+feed <name> [=n]  |  +feed/herd [=n]%cn",
      ]));
      return;
    }

    // /herd, /herd=2, /herd 2
    if (sw === "herd" || sw.startsWith("herd=") || sw.startsWith("herd/")) {
      let amount = 1;
      const fromSw = sw.match(/^herd(?:=|\/)?(\d+)?$/i);
      if (fromSw?.[1]) {
        const n = parsePositiveInt(fromSw[1]);
        if (n === null) {
          u.send("Usage: +feed/herd [=n]");
          return;
        }
        amount = n;
      } else if (rest) {
        const eq = rest.match(/^=?\s*(\d+)\s*$/);
        const n = parsePositiveInt(eq?.[1] ?? rest);
        if (n === null) {
          u.send("Usage: +feed/herd [=n]");
          return;
        }
        amount = n;
      }
      const r = feedFromHerd(char, amount);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(`%cg${r.message}%cn`);
      poseRoom(
        u,
        `%cy${u.util.displayName(u.me, u.me)}%cn slips away to the Herd.`,
      );
      if (r.gained) {
        emitPoolRegained({
          playerId: u.me.id,
          charId: char.id,
          pool: "blood",
          amount: r.gained,
          remaining: char.bloodPool ?? 0,
          permanent: char.bloodMax ?? 0,
        });
      }
      return;
    }

    // +feed <target>[=n]
    let targetStr = rest || sw;
    let amount = 1;
    const eq = targetStr.match(/^(.+?)\s*=\s*(\d+)\s*$/);
    if (eq) {
      targetStr = eq[1].trim();
      const n = parsePositiveInt(eq[2]);
      if (n === null) {
        u.send("Amount must be a positive integer.");
        return;
      }
      amount = n;
    }
    if (!targetStr) {
      u.send("Usage: +feed <target> [=n]");
      return;
    }

    const tgt = await u.util.target(u.me, targetStr, true);
    if (!tgt) {
      u.send("Target not found.");
      return;
    }
    const vessel = await findByPlayer(tgt.id);
    if (!vessel) {
      u.send("Target has no character on file.");
      return;
    }

    const r = feedFromVessel(char, vessel, amount);
    if (!r.ok) {
      u.send(`%cr${r.message}%cn`);
      return;
    }
    await saveChar(char);
    await saveChar(vessel);
    const vName = u.util.displayName(tgt, u.me);
    u.send(`%cg${r.message}%cn`);
    if (r.bondNote) u.send(`%cy${r.bondNote}%cn`);
    u.send(
      `%cr${u.util.displayName(u.me, u.me)} feeds from you` +
        (r.vesselDamage
          ? ` (${r.vesselDamage} lethal)`
          : "") +
        `.%cn`,
      tgt.id,
    );
    poseRoom(
      u,
      `%cy${u.util.displayName(u.me, u.me)}%cn feeds hungrily.`,
    );
    if (r.gained) {
      emitPoolRegained({
        playerId: u.me.id,
        charId: char.id,
        pool: "blood",
        amount: r.gained,
        remaining: char.bloodPool ?? 0,
        permanent: char.bloodMax ?? 0,
      });
    }
    if (r.vesselDamage && r.vesselDamage > 0) {
      emitHealthChanged({
        actorId: u.me.id,
        targetId: tgt.id,
        charId: vessel.id,
        action: "hurt",
        damageType: "L",
        amount: r.vesselDamage,
        track: vessel.healthTrack ?? [],
      });
    }
    if (r.vesselDown) {
      u.send(`%cr${vName} collapses from blood loss.%cn`);
    }
  },
});
