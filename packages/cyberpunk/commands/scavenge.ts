/**
 * +scavenge -- Zone Scavenging and Loot System
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import { getZone, rollLoot, ZONES as ZONE_CATALOG } from "../data/scavenge-tables.ts";
import { rollEBRange } from "../engine/economy.ts";
import { emitScavengeRolled, emitScavengeFound, emitScavengeAmbush } from "../engine/emitters.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap, grid } from "./chargen.ts";

// Cooldown: 1 scavenge attempt per 30 minutes (real-time)
const SCAVENGE_COOLDOWN_MS = 30 * 60 * 1000;

addCmd({
  name: "+scavenge",
  pattern: /^\+scavenge(?:\s+(\S+))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+scavenge [<zone>]  -- Pick through the rubble for salvage.

Scavenging has a 30-minute real-time cooldown.
Higher danger zones offer better loot but risk ambush.

Zones: safe, contested, hot, combat, hellhole

Without a zone, uses the current room's default zone.
Your Streetwise + Perception + INT help you find better scores.

Examples:
  +scavenge              Scavenge current zone.
  +scavenge hot          Hit a hot zone.
  +scavenge hellhole     Risk everything for the best score.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    // Cooldown check via roleData timestamp
    const lastScavenge = (cpr.roleData as Record<string, unknown>).lastScavengeAt as number | undefined;
    if (lastScavenge && Date.now() - lastScavenge < SCAVENGE_COOLDOWN_MS) {
      const remaining = Math.ceil((SCAVENGE_COOLDOWN_MS - (Date.now() - lastScavenge)) / 60000);
      u.send(`${ERR}Area still hot. Wait ${val(String(remaining))} ${dim("more minute" + (remaining !== 1 ? "s" : ""))} before scavenging again.`);
      return;
    }

    const zoneArg = u.util.stripSubs(u.cmd.args[0] ?? "").trim().toLowerCase();
    const zoneName = zoneArg || getRoomZone(u.me.location);
    const zone = getZone(zoneName);

    if (!zone) {
      const validZones = ZONE_CATALOG.map((z) => acc(z.name)).join(dim(", "));
      u.send(`${ERR}Unknown zone ${val('"' + zoneName + '"')}. Valid: ${validZones}`); return;
    }

    // Scavenge roll: INT + Streetwise + Perception + 1d10 vs zone DV
    const streetwise = cpr.skills["streetwise"] ?? 0;
    const perception = cpr.skills["perception"] ?? 0;
    const roll = Math.floor(Math.random() * 10) + 1;
    const total = cpr.stats.int + streetwise + perception + roll;

    await emitScavengeRolled(
      u.me.id,
      u.me.name ?? "Unknown",
      zoneName,
      total,
      zone.scavengeDV,
    );

    // Save cooldown timestamp
    await u.db.modify(u.me.id, "$set", { "state.cpr.roleData.lastScavengeAt": Date.now() });

    u.send([
      div(),
      row("ZONE",  acc(zone.name.toUpperCase())),
      row("ROLL",  `${val(String(roll))}  ${dim("total")} ${val(String(total))}  ${dim("vs DV")} ${val(String(zone.scavengeDV))}`),
      div(),
    ].join("\r\n"));

    // Ambush check (zone dependent)
    if (Math.random() < zone.ambushChance) {
      const ambushMsg = rollAmbushEncounter(zone.name);
      u.send([
        bar(),
        `  %cr!! AMBUSH !!%cn`,
        div(),
        ...wrap(ambushMsg, 74, "  "),
        bar(),
      ].join("\r\n"));
      u.here.broadcast?.(
        `${ERR}${acc(u.util.displayName(u.me, u.me))}'s scavenging draws unwanted attention!`,
      );
      await emitScavengeAmbush(
        u.me.id,
        u.me.name ?? "Unknown",
        zoneName,
        total,
        zone.scavengeDV,
      );
      return;
    }

    if (total < zone.scavengeDV) {
      u.send(`${ARR}${dim("Nothing useful found. The area's been picked clean.")}`); return;
    }

    // Roll loot
    const loot = rollLoot(zone.name, total >= zone.scavengeDV + 5);
    if (!loot || loot.length === 0) {
      const loose = rollEBRange(10, 50);
      u.send(`${OK}You find ${val(loose.toLocaleString())} ${dim("eb")} in loose change and scrap.`); return;
    }

    const lines: string[] = [
      bar(),
      hdr("LOOT FOUND"),
      bar(),
    ];
    let totalEB = 0;

    for (const item of loot) {
      if (item.type === "eb") {
        const amount = rollEBRange(item.minEB ?? 10, item.maxEB ?? 100);
        totalEB += amount;
        lines.push(row(dim("eddies"), `${val(amount.toLocaleString())} ${dim("eb")}  ${dim("(cash/trade goods)")}`));
      } else {
        const desc = item.description ? dim("  -- " + item.description) : "";
        lines.push(row(acc(item.name ?? "item"), dim(item.description ?? "")));
      }
    }

    if (totalEB > 0) {
      lines.push(div());
      lines.push(row("TOTAL EB", `${OK}${val("+" + totalEB.toLocaleString())} ${dim("eb")}`));
      await u.db.modify(u.me.id, "$inc", { "state.cpr.eurodollars": totalEB });
    }
    lines.push(bar());

    u.send(lines.join("\r\n"));
    const lootNames = Array.isArray(loot)
      ? loot.map((l: { name?: string }) => l.name ?? "eb").join(", ")
      : "loot";
    await emitScavengeFound(
      u.me.id,
      u.me.name ?? "Unknown",
      zoneName,
      total,
      zone.scavengeDV,
      lootNames,
    );
  },
});

/** Determine a room's default scavenge zone from its name or flags. */
function getRoomZone(roomId: string): string {
  // Default to "contested" -- admins can set room zones via +cpr/setzone
  return "contested";
}

/** Generate an ambush encounter description based on zone. */
function rollAmbushEncounter(zone: string): string {
  const encounters: Record<string, string[]> = {
    safe:      ["A local gang demands you hand over your finds.", "Security drones flag your location."],
    contested: ["A scav crew wants to fight you for the turf.", "Boostergangers roll up looking for trouble."],
    hot:       ["Combat zone veterans mistake you for a target.", "An armed drone opens fire on movement."],
    combat:    ["MaxTac patrols open fire on sight.", "Black ICE defense system activates."],
    hellhole:  ["Everything comes at you at once. Run.", "The zone itself seems to fight back."],
  };
  const options = encounters[zone] ?? encounters["contested"];
  return options[Math.floor(Math.random() * options.length)];
}
