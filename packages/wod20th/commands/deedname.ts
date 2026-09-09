// commands/deedname.ts -- +deedname [<value>]  and  +deedname/clear  and  +deedname <target>=<value> (staff)
// Garou deed names are shown to onlookers while in any non-homid form. The
// underlying login name never changes -- this is a presentation-only field.
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";

const MAX_LEN = 40;

addCmd({
  name: "+deedname",
  pattern: /^\+deedname(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Character Generation",
  help: `+deedname [<value>]  -- Set or view your Garou deed name.

  Shown in place of your name when you are in any non-homid form
  (Glabro, Crinos, Hispo, Lupus). Your login name is unchanged --
  others can still page or target you by it.

SYNTAX
  +deedname                       Show your current deed name.
  +deedname <value>               Set your deed name.
  +deedname/clear                 Remove your deed name.
  +deedname <target>=<value>      (Staff) Set a target's deed name.

EXAMPLES
  +deedname Storms-the-River
  +deedname/clear
  +deedname Storms=Lightning-Maul   (staff)

SEE ALSO: +help shift, +help sheet`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /clear --------------------------------------------------------------
    if (sw === "clear") {
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      // saveChar's allowlist skips undefined fields, so use "" as the cleared
      // sentinel. shiftedDisplayName treats empty as no deed.
      char.deedName = "";
      await saveChar(char);
      u.send("%cgYour deed name has been cleared.%cn");
      return;
    }

    if (sw && sw !== "") {
      u.send(`Unknown switch: /${sw}. See +help deedname.`);
      return;
    }

    // -- staff: +deedname <target>=<value> ----------------------------------
    const eq = rest.indexOf("=");
    if (eq !== -1) {
      const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      if (!isStaff) { u.send("Permission denied."); return; }

      const targetArg = rest.slice(0, eq).trim();
      const value     = rest.slice(eq + 1).trim();
      if (!targetArg || !value) { u.send("Usage: +deedname <target>=<value>"); return; }
      if (value.length > MAX_LEN) {
        u.send(`Deed names are limited to ${MAX_LEN} characters.`); return;
      }

      const target = await u.util.target(u.me, targetArg, true);
      if (!target) { u.send("Target not found."); return; }
      if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

      const char = await findByPlayer(target.id);
      if (!char) { u.send(`${u.util.displayName(target, u.me)} has no character on file.`); return; }

      const old = char.deedName;
      char.deedName = value;
      char.statLog.push({
        staffId: u.me.id,
        trait: "deedName",
        old: old ?? null,
        new: value,
        ts: Date.now(),
      });
      await saveChar(char);
      u.send(`%cg${u.util.displayName(target, u.me)}'s deed name set to %ch${value}%cn%cg.%cn`);
      return;
    }

    // -- self: show or set ---------------------------------------------------
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }

    if (!rest) {
      u.send(char.deedName
        ? `Your deed name: %ch${char.deedName}%cn`
        : "You have no deed name set. Try %ch+deedname <value>%cn.");
      return;
    }

    if (rest.length > MAX_LEN) {
      u.send(`Deed names are limited to ${MAX_LEN} characters.`); return;
    }

    char.deedName = rest;
    await saveChar(char);
    u.send(`%cgDeed name set: %ch${rest}%cn`);
  },
});
