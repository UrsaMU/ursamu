// commands/derange.ts -- +derange permanent derangements.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  DERANGEMENTS,
  addDerangement,
  listDerangements,
  removeDerangement,
} from "../core/derangement.ts";
import { isKindred } from "../core/kindred.ts";
import { footer, header } from "../core/format.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+derange",
  pattern: /^\+derange(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+derange[/switch] [<args>]  -- Derangements.

SYNTAX
  +derange                     Your derangements.
  +derange/list                Catalog.
  +derange/add <name> [<tgt>]  Add (self or staff->target).
  +derange/remove <name> [<tgt>]
                               Remove (Malkavian keeps >=1).

SEE ALSO: +help humanity, +help beast`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "list") {
      const lines = [header("Derangements")];
      for (const d of DERANGEMENTS) {
        lines.push(`  %ch${d.name.padEnd(22)}%cn ${d.blurb}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "add" || sw === "remove") {
      const parts = arg.split(/\s+/).filter(Boolean);
      if (!parts.length) {
        u.send(`Usage: +derange/${sw} <name> [<target>]`);
        return;
      }
      let name = parts[0];
      let targetPlayer = u.me;
      if (parts.length > 1) {
        if (!isStaff(u)) {
          u.send("%crOnly staff set derangements on others.%cn");
          return;
        }
        // last token may be target if multi-word name not used
        const t = await u.util.target(u.me, parts[parts.length - 1], true);
        if (t) {
          targetPlayer = t;
          name = parts.slice(0, -1).join(" ") || parts[0];
        } else {
          name = parts.join(" ");
        }
      }
      const char = await findByPlayer(targetPlayer.id);
      if (!char) {
        u.send("No character on file.");
        return;
      }
      if (!isKindred(char) && char.splat !== "mortal") {
        u.send("Target cannot hold derangements.");
        return;
      }
      const r = sw === "add"
        ? addDerangement(char, name)
        : removeDerangement(char, name);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(char);
      u.send(`%cg${r.message}%cn`);
      return;
    }

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    const list = listDerangements(char);
    const lines = [header("Your Derangements")];
    if (!list.length) {
      lines.push("  (None.)");
    } else {
      for (const d of list) {
        lines.push(`  %ch${d.name}%cn -- ${d.blurb}`);
      }
    }
    lines.push(footer());
    u.send(lines.join("%r"));
  },
});
