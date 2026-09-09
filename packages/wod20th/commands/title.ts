// commands/title.ts -- +title browse + display earned titles.
//
// Read-only on the data side. /award and /revoke are staff overrides
// for ST stories that grant or remove titles outside the kill engine.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { allTitles, getTitle } from "../core/titles.ts";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import { awardRenown } from "../core/renown.ts";
import { divider, footer, header } from "../core/format.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+title",
  pattern: /^\+title(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+title[/switch] [<args>]  -- Earned Garou titles + thresholds.

SYNTAX
  +title                       Show your earned titles.
  +title/list                  List the title catalog.
  +title/info <slug>           Show one title's criterion and reward.
  +title/sheet [<target>]      Show another character's titles.
  +title/award <target>=<slug> (Staff) Grant a title outside the kill engine.
  +title/revoke <target>=<slug> (Staff) Remove a title (does NOT refund renown).

EXAMPLES
  +title
  +title/info bane-killer
  +title/list
  +title/award Alice=spiral-breaker

SEE ALSO: +help npc, +help renown, +help sheet`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- catalog list --------------------------------------------------
    if (sw === "list") {
      const lines: string[] = [header("Title Catalog")];
      for (const t of allTitles()) {
        lines.push(`  %ch${t.name.padEnd(24)}%cn  [${t.slug}]  +${t.reward.amount} ${t.reward.track}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- info on one title --------------------------------------------
    if (sw === "info") {
      if (!arg) { u.send("Usage: +title/info <slug>"); return; }
      const t = getTitle(arg);
      if (!t) { u.send(`Unknown title: ${arg}`); return; }
      const lines: string[] = [
        header(`Title: ${t.name}`),
        `  Slug:    ${t.slug}`,
        `  Reward:  +${t.reward.amount} temp ${t.reward.track}`,
        divider("Description"),
        `  ${t.description}`,
        footer(),
      ];
      u.send(lines.join("%r"));
      return;
    }

    // -- self / target sheet ------------------------------------------
    if (!sw || sw === "sheet") {
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

      const titles = char.titles ?? [];
      const lines: string[] = [header(`Titles -- ${label}`)];
      if (titles.length === 0) {
        lines.push("  (No titles earned yet.)");
      } else {
        for (const slug of titles) {
          const t = getTitle(slug);
          if (!t) { lines.push(`  %cy(unknown title: ${slug})%cn`); continue; }
          lines.push(`  %ch${t.name}%cn  [${slug}]`);
          lines.push(`    ${t.description}`);
        }
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // -- staff: award / revoke ----------------------------------------
    if (sw === "award" || sw === "revoke") {
      if (!isStaff(u)) { u.send("Permission denied."); return; }
      const eq = arg.indexOf("=");
      if (eq < 0) { u.send(`Usage: +title/${sw} <target>=<slug>`); return; }
      const name = arg.slice(0, eq).trim();
      const slug = arg.slice(eq + 1).trim().toLowerCase();
      if (!name || !slug) { u.send(`Usage: +title/${sw} <target>=<slug>`); return; }
      const tgt = await u.util.target(u.me, name, true);
      if (!tgt) { u.send(`Target not found: ${name}`); return; }
      const char = await findByPlayer(tgt.id);
      if (!char) { u.send("Target has no character on file."); return; }
      const def = getTitle(slug);
      if (!def) { u.send(`Unknown title: ${slug}`); return; }

      const titles = char.titles ?? [];
      const has = titles.includes(slug);
      if (sw === "award") {
        if (has) { u.send(`${u.util.displayName(tgt, u.me)} already holds ${def.name}.`); return; }
        char.titles = [...titles, slug];
        awardRenown(char, def.reward.track, def.reward.amount);
        await saveChar(char);
        u.send(`%cgGranted %ch${def.name}%cn%cg to ${u.util.displayName(tgt, u.me)} (+${def.reward.amount} ${def.reward.track}).%cn`);
        return;
      }
      // revoke
      if (!has) { u.send(`${u.util.displayName(tgt, u.me)} does not hold ${def.name}.`); return; }
      char.titles = titles.filter((s) => s !== slug);
      await saveChar(char);
      u.send(`%cyRevoked ${def.name} from ${u.util.displayName(tgt, u.me)} (renown not refunded).%cn`);
      return;
    }

    u.send(`Unknown switch: /${sw}. See +help title.`);
  },
});
