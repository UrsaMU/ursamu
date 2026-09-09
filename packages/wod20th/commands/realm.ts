// commands/realm.ts -- browse the W20 Umbral Realm catalog.
//
// Read-only catalog UI. Active travel to arbitrary Realms is out of
// scope (Deep Umbra is ritual-level). Moon bridges between caerns are
// handled by +stepside/moonbridge.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { allRealms, getRealm, realmsByDepth } from "../core/realms.ts";
import { divider, footer, header } from "../core/format.ts";

addCmd({
  name: "+realm",
  pattern: /^\+realm(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+realm[/switch] [<slug>]  -- Browse Umbral Realms (W20 Ch 7).

SYNTAX
  +realm                 List all Realms (Near + Deep).
  +realm/list            Same as +realm.
  +realm/info <slug>     Show a single Realm's description.
  +realm/near            Just the Near Umbra realms.
  +realm/deep            Just the Deep Umbra realms.

EXAMPLES
  +realm/info pangaea
  +realm/near
  +realm/info battleground

SEE ALSO: +help stepside, +help spirit`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim().toLowerCase();

    if (sw === "info") {
      if (!arg) { u.send("Usage: +realm/info <slug>"); return; }
      const r = getRealm(arg);
      if (!r) { u.send(`No realm with slug "${arg}". Try +realm to list.`); return; }
      const lines: string[] = [
        header(`Realm: ${r.name}`),
        `  Depth:  ${r.depth === "near" ? "Near Umbra" : "Deep Umbra"}`,
      ];
      if (r.gauntlet) lines.push(`  Gauntlet: ${r.gauntlet}`);
      lines.push(divider("Description"));
      lines.push(`  ${r.description}`);
      if (r.notes) {
        lines.push(divider("Notes"));
        lines.push(`  ${r.notes}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    const set =
      sw === "near" ? realmsByDepth("near") :
      sw === "deep" ? realmsByDepth("deep") :
      allRealms();
    const title =
      sw === "near" ? "Near Umbra" :
      sw === "deep" ? "Deep Umbra" :
      "Umbral Realms";

    const lines: string[] = [header(title)];
    let lastDepth: string | null = null;
    for (const r of set) {
      if (!sw && r.depth !== lastDepth) {
        lines.push(divider(r.depth === "near" ? "Near Umbra" : "Deep Umbra"));
        lastDepth = r.depth;
      }
      lines.push(`  %ch${r.name.padEnd(24)}%cn  ${r.slug}`);
    }
    lines.push(footer());
    u.send(lines.join("%r"));
  },
});
