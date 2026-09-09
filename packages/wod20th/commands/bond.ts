// commands/bond.ts -- +bond blood bond tracking.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import {
  deepenBond,
  weakenBond,
  listBonds,
  bondLevel,
} from "../core/bond.ts";
import { isKindred } from "../core/kindred.ts";
import { frame } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+bond",
  pattern: /^\+bond(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+bond[/switch] [<args>]  -- Blood bonds (1-3 drinks).

SYNTAX
  +bond                     List your bonds (regnants).
  +bond/drink <regnant>     One drink toward bond with them.
  +bond/break <regnant>     Staff: weaken or clear bond.
  +bond/break/full <id>     Staff: full break (by char id).

EXAMPLES
  +bond/drink Prince
  +bond
  +bond/break Alice

SEE ALSO: +help feed, +help embrace, +help blood`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }

    if (!sw || sw === "list" || sw === "show") {
      const bonds = listBonds(char);
      if (bonds.length === 0) {
        u.send(frame("Blood Bonds", ["  (none)"]));
        return;
      }
      const lines = bonds.map((b) =>
        `  ${b.id.padEnd(24)}  ${b.level}/3`
      );
      u.send(frame("Blood Bonds", lines));
      return;
    }

    if (sw === "drink") {
      if (!rest) {
        u.send("Usage: +bond/drink <regnant>");
        return;
      }
      const tgt = await u.util.target(u.me, rest, true);
      if (!tgt) {
        u.send("Target not found.");
        return;
      }
      const regnant = await findByPlayer(tgt.id);
      if (!regnant || !isKindred(regnant)) {
        u.send("Regnant must be Kindred on file.");
        return;
      }
      const r = deepenBond(char, regnant);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(`%cg${r.message}%cn`);
      poseRoom(
        u,
        `%cy${u.util.displayName(u.me, u.me)}%cn drinks deeply of ` +
          `${u.util.displayName(tgt, u.me)}%cy's vitae.%cn`,
      );
      return;
    }

    if (sw === "break" || sw === "break/full") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      if (!rest) {
        u.send("Usage: +bond/break <target|regnantId>");
        return;
      }
      // thrall is "me" context? Staff breaks on a thrall:
      // +bond/break <thrall> <regnant> OR thrall views.
      // Simplified: break bond ON target TO named regnant,
      // or if one arg, clear all bonds on target.
      const parts = rest.split(/\s+/).filter(Boolean);
      const thrallObj = await u.util.target(u.me, parts[0], true);
      if (!thrallObj) {
        u.send("Thrall not found.");
        return;
      }
      if (!(await u.canEdit(u.me, thrallObj))) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const thrall = await findByPlayer(thrallObj.id);
      if (!thrall) {
        u.send("No character on file.");
        return;
      }
      let regnantId = parts[1];
      if (!regnantId) {
        const bonds = listBonds(thrall);
        if (bonds.length === 1) regnantId = bonds[0].id;
        else {
          u.send("Usage: +bond/break <thrall> <regnantId>");
          return;
        }
      } else {
        const rObj = await u.util.target(u.me, regnantId, true);
        if (rObj) {
          const rc = await findByPlayer(rObj.id);
          if (rc) regnantId = rc.id;
        }
      }
      const full = sw === "break/full" || bondLevel(thrall, regnantId) <= 1;
      const r = weakenBond(thrall, regnantId, full);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(thrall);
      if (!thrall.bonds) {
        await unsetCharFields(thrall.id, ["bonds"]);
      }
      u.send(`%cg${r.message}%cn`);
      return;
    }

    u.send(`Unknown switch /${sw}. Try +help bond.`);
  },
});
