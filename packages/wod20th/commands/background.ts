// commands/background.ts -- browse the W20 Backgrounds catalog.
//
// Read-only catalog UI. Backgrounds are still purchased via +stat /
// chargen and spent through +xp; this surface just exposes the canon so
// players can read the dot ladders and tribe gating without flipping
// books.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { allBackgrounds, getBackground } from "../splats/wta/data/backgrounds.ts";
import { divider, footer, header } from "../core/format.ts";

addCmd({
  name: "+background",
  pattern: /^\+background(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+background[/switch] [<slug>]  -- Browse W20 Backgrounds (W20 Ch 3).

SYNTAX
  +background                 List all Backgrounds.
  +background/list            Same as +background.
  +background/info <slug>     Show one Background's dot ladder and notes.

EXAMPLES
  +background/info pure-breed
  +background/info ancestors
  +background/info totem

SEE ALSO: +help chargen, +help xp, +help pack`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim().toLowerCase();

    if (sw === "info") {
      if (!arg) { u.send("Usage: +background/info <slug>"); return; }
      const b = getBackground(arg);
      if (!b) {
        u.send(`No background with slug "${arg}". Try +background to list.`);
        return;
      }
      const lines: string[] = [
        header(`Background: ${b.name}`),
        `  Slug:  ${b.slug}`,
      ];
      if (b.restrictedTo && b.restrictedTo.length > 0) {
        lines.push(`  Tribe: ${b.restrictedTo.join(", ")}`);
      }
      lines.push(divider("Description"));
      lines.push(`  ${b.description}`);
      lines.push(divider("Dot Ladder"));
      lines.push(`  %ch.%cn      ${b.dots[1]}`);
      lines.push(`  %ch..%cn     ${b.dots[2]}`);
      lines.push(`  %ch...%cn    ${b.dots[3]}`);
      lines.push(`  %ch....%cn   ${b.dots[4]}`);
      lines.push(`  %ch.....%cn  ${b.dots[5]}`);
      if (b.notes) {
        lines.push(divider("Notes"));
        lines.push(`  ${b.notes}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    // Default + /list: render the catalog.
    const xs = allBackgrounds();
    const lines: string[] = [header("WtA Backgrounds (W20)")];
    for (const b of xs) {
      const gate = b.restrictedTo && b.restrictedTo.length > 0
        ? `  %ch[${b.restrictedTo.join(", ")}]%cn`
        : "";
      lines.push(`  %ch${b.name.padEnd(14)}%cn  ${b.slug.padEnd(14)}${gate}`);
    }
    lines.push(divider(null));
    lines.push("  +background/info <slug> for the full dot ladder.");
    lines.push(footer());
    u.send(lines.join("%r"));
  },
});
