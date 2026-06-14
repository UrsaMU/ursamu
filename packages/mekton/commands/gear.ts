import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { chars } from "../schema.ts";
import type { IEquipmentItem } from "../schema.ts";
import { findGearByName, gearByCategory, GEAR_CATALOG } from "../catalog.ts";
import type { GearCategory } from "../catalog.ts";
import { derivedStats, effectiveMA } from "../derived.ts";

const CATEGORIES: GearCategory[] = ["melee", "handgun", "smg", "rifle", "shotgun", "heavy", "armor", "tool"];

addCmd({
  name: "+gear",
  pattern: /^\+gear$/i,
  lock: "connected",
  category: "Gear",
  help: `+gear  — List your current equipment and total weight.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found. Use %cy+chargen/start%cn first."); return; }

    const totalWeight = char.equipment.reduce((s, i) => s + i.weight, 0);
    const d = derivedStats(char);
    const eff = effectiveMA(char);
    const lines = [
      u.util.header("EQUIPMENT"),
      ` Cash: ¥${char.cash}   Weight: ${totalWeight.toFixed(1)}kg / EV ${d.ev}   Eff. MA: ${eff}`,
      "",
    ];
    if (char.equipment.length === 0) {
      lines.push("  (no equipment)");
    } else {
      for (const item of char.equipment) {
        const spInfo = item.sp ? ` SP:${item.sp}${item.location ? `@${item.location}` : ""}` : "";
        const dmgInfo = item.damage ? ` ${item.damage}` : "";
        lines.push(u.util.sprintf("  %-28s %-5skg  ¥%-6d%s%s", item.name, item.weight.toFixed(1), item.cost, dmgInfo, spInfo));
      }
    }
    u.send(lines.join("%r"));
  },
});

addCmd({
  name: "+gear/catalog",
  pattern: /^\+gear\/catalog(?:\s+(.*))?/i,
  lock: "connected",
  category: "Gear",
  help: `+gear/catalog [<category>]  — Browse the gear catalog.

Categories: melee, handgun, smg, rifle, shotgun, heavy, armor, tool

Examples:
  +gear/catalog           List all categories.
  +gear/catalog armor     List all armor items.
  +gear/catalog handgun   List all handguns.`,
  exec: (u: IUrsamuSDK) => {
    const catRaw = u.util.stripSubs(u.cmd.args[0] ?? "").toLowerCase().trim() as GearCategory;

    if (!catRaw) {
      const lines = [
        u.util.header("GEAR CATALOG"),
        " Categories: " + CATEGORIES.join(", "),
        ` Total items: ${GEAR_CATALOG.length}`,
        " Use %cy+gear/catalog <category>%cn to browse.",
      ];
      u.send(lines.join("%r"));
      return;
    }
    if (!CATEGORIES.includes(catRaw)) {
      u.send(`Unknown category. Valid: ${CATEGORIES.join(", ")}.`); return;
    }
    const items = gearByCategory(catRaw);
    const lines = [u.util.header(catRaw.toUpperCase())];
    for (const item of items) {
      const spStr = item.sp ? `SP:${item.sp}` : "";
      lines.push(
        u.util.sprintf("  %%cy%-26s%%cn  %-10s  %-6s  %-6s  %-6s  TL%s",
          item.name,
          item.damage ?? "",
          spStr,
          `${item.weight}kg`,
          `¥${item.cost}`,
          item.tl ?? "?"
        )
      );
    }
    u.send(lines.join("%r"));
  },
});

addCmd({
  name: "+gear/buy",
  pattern: /^\+gear\/buy\s+(.*)/i,
  lock: "connected",
  category: "Gear",
  help: `+gear/buy <item name>  — Purchase an item from the catalog.

Examples:
  +gear/buy Combat Pistol    Buy a Combat Pistol (deducts ¥310).
  +gear/buy Heavy Helmet     Buy a Heavy Helmet (deducts ¥128).`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const item = findGearByName(name);
    if (!item) { u.send(`"${name}" not found. Use %cy+gear/catalog%cn to browse.`); return; }

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found."); return; }
    if (char.cash < item.cost) { u.send(`Insufficient funds. Need ¥${item.cost}, have ¥${char.cash}.`); return; }

    const equipment = [...char.equipment, item];
    const cash = char.cash - item.cost;
    await chars.update({ id: char.id }, { equipment, cash });
    u.send(`Purchased %cy${item.name}%cn for ¥${item.cost}. Remaining cash: ¥${cash}.`);
  },
});

addCmd({
  name: "+gear/add",
  pattern: /^\+gear\/add\s+(.+)=(\d+(?:\.\d+)?),(\d+)/i,
  lock: "connected",
  category: "Gear",
  help: `+gear/add <name>=<weight>,<cost>  — Add a custom (non-catalog) item.

Examples:
  +gear/add Pilot Suit=2,300    Add a custom 2kg pilot suit costing ¥300.`,
  exec: async (u: IUrsamuSDK) => {
    const name   = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const weight = parseFloat(u.cmd.args[1] ?? "0");
    const cost   = parseInt(u.cmd.args[2] ?? "0", 10);
    if (!name || isNaN(weight) || isNaN(cost)) { u.send("Usage: %cy+gear/add <name>=<weight>,<cost>%cn"); return; }

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found."); return; }

    const item: IEquipmentItem = { name, category: "other", weight, cost };
    const equipment = [...char.equipment, item];
    await chars.update({ id: char.id }, { equipment });
    u.send(`Added %cy${name}%cn (${weight}kg, ¥${cost}).`);
  },
});

addCmd({
  name: "+gear/remove",
  pattern: /^\+gear\/remove\s+(.*)/i,
  lock: "connected",
  category: "Gear",
  help: `+gear/remove <item name>  — Remove an item from your inventory.

Examples:
  +gear/remove Combat Knife    Remove the Combat Knife from inventory.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found."); return; }

    const idx = char.equipment.findIndex((i) => i.name.toLowerCase() === name.toLowerCase());
    if (idx === -1) { u.send(`"${name}" not in your inventory.`); return; }

    const equipment = [...char.equipment];
    equipment.splice(idx, 1);
    await chars.update({ id: char.id }, { equipment });
    u.send(`Removed %cy${char.equipment[idx].name}%cn from inventory.`);
  },
});

addCmd({
  name: "+encumbrance",
  pattern: /^\+encumbrance$/i,
  lock: "connected",
  category: "Gear",
  help: `+encumbrance  — Show current encumbrance load vs EV and effective MA.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found."); return; }
    const d = derivedStats(char);
    const totalWeight = char.equipment.reduce((s, i) => s + i.weight, 0);
    const load = Math.floor(totalWeight / d.ev);
    const eff = Math.max(0, char.stats.ma - load);
    u.send(`Weight: ${totalWeight.toFixed(1)}kg  EV: ${d.ev}  Load: ${load}  MA: ${char.stats.ma} → Effective MA: %cy${eff}%cn`);
  },
});
