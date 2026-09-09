// commands/scar.ts -- +scar (list / clear) for permanent battle scars.
//
// Scars are written by +attack when a Garou survives Aggravated damage
// that fills the Incap slot. They persist through regen; only staff
// removes one via +scar/clear <target>=<slug>.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { divider, footer, header } from "../core/format.ts";

function isStaffUser(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+scar",
  pattern: /^\+scar(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+scar[/switch] [<arg>]  -- Permanent battle scars.

SYNTAX
  +scar                        List your own scars.
  +scar/list                   Same as +scar.
  +scar/list <target>          List another character's scars.
  +scar/clear <target>=<slug>  (Staff) Remove one scar by slug.

EXAMPLES
  +scar                        Your scar sheet.
  +scar/list Alice             Alice's scars.
  +scar/clear Alice=missing-eye  Staff removes that scar.

SEE ALSO: +help attack, +help renown, +help regen`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- list ---------------------------------------------------------------
    if (!sw || sw === "list") {
      let char;
      let label: string;
      if (arg) {
        const tgt = await u.util.target(u.me, arg, true);
        if (!tgt) { u.send(`Target not found: ${arg}`); return; }
        char = await findByPlayer(tgt.id);
        label = u.util.displayName(tgt, u.me);
      } else {
        char = await findByPlayer(u.me.id);
        label = u.util.displayName(u.me, u.me);
      }
      if (!char) { u.send("No character on file."); return; }

      const scars = char.scars ?? [];
      const lines: string[] = [header(`Battle Scars -- ${label}`)];
      if (scars.length === 0) {
        lines.push("  (No scars borne.)");
      } else {
        for (const s of scars) {
          lines.push(`  %ch${s.name}%cn  (%cy+${s.glory} Glory%cn)`);
          lines.push(`    slug: ${s.slug}`);
          lines.push(`    ${s.description}`);
          if (s.cause) lines.push(`    cause: ${s.cause}`);
        }
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- clear (staff) ------------------------------------------------------
    if (sw === "clear") {
      if (!isStaffUser(u)) { u.send("Permission denied."); return; }
      const eq = arg.indexOf("=");
      if (eq < 0) { u.send("Usage: +scar/clear <target>=<slug>"); return; }
      const targetName = arg.slice(0, eq).trim();
      const slug = arg.slice(eq + 1).trim().toLowerCase();
      if (!targetName || !slug) { u.send("Usage: +scar/clear <target>=<slug>"); return; }

      const tgt = await u.util.target(u.me, targetName, true);
      if (!tgt) { u.send(`Target not found: ${targetName}`); return; }
      const char = await findByPlayer(tgt.id);
      if (!char) { u.send("Target has no character on file."); return; }

      const scars = char.scars ?? [];
      const idx = scars.findIndex((s) => s.slug === slug);
      if (idx < 0) { u.send(`${u.util.displayName(tgt, u.me)} has no scar "${slug}".`); return; }
      const removed = scars[idx];
      char.scars = scars.filter((_, i) => i !== idx);
      await saveChar(char);
      u.send(`%cgRemoved %ch${removed.name}%cn%cg from ${u.util.displayName(tgt, u.me)}.%cn`);
      return;
    }

    u.send(`Unknown switch: /${sw}. See +help scar.`);
  },
});

// Re-export staff predicate for tests.
export const _testing = { isStaffUser };
