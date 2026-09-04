/**
 * +event — roll local color / boons / ambushes.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import {
  EVENT_TABLES,
  listEventTables,
  rollEvent,
} from "../world/events.ts";
import { applyEventBand } from "../world/event-apply.ts";
import { countParty } from "../adventure/party.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { defaultSheet, migrateSheet } from
  "../stats/dnd_sheet.ts";
import {
  listHostiles,
  startRoomFight,
} from "../combat/start-fight.ts";
import { roomIdOf } from "../combat/session.ts";
import { getSeedRecord, getTownSeed, WORLD } from
  "../world/seed.ts";
import { listCampaignTowns } from "../world/campaign.ts";

async function spawnMob(
  u: IUrsamuSDK,
  roomId: string,
  template: string,
  name: string,
): Promise<void> {
  const t = NPC_TEMPLATES[template];
  const sheet = migrateSheet(defaultSheet());
  sheet.class = "Monster";
  if (t) {
    sheet.hp = { max: t.hp, current: t.hp, temp: 0 };
    sheet.ac = t.ac;
    sheet.xp = t.xp;
    // deno-lint-ignore no-explicit-any
    (sheet as any).drops = t.drops ?? [];
  }
  // deno-lint-ignore no-explicit-any
  (sheet as any).aiKey = "aggressive";
  // deno-lint-ignore no-explicit-any
  (sheet as any).npcTemplate = template.toLowerCase();
  await u.db.create({
    flags: new Set(["thing", "npc"]),
    location: roomId,
    name: `${name};hostile;event`,
    state: { name, dnd: sheet, owner: "1" },
  });
}

async function guessTable(
  roomId: string,
): Promise<"town" | "road" | "wild"> {
  const towns = listCampaignTowns();
  for (const t of towns) {
    const seed = t.id === WORLD.id
      ? await getSeedRecord()
      : await getTownSeed(t.id);
    if (!seed?.rooms) continue;
    for (const [key, id] of Object.entries(seed.rooms)) {
      if (id !== roomId) continue;
      if (
        key === "path" || key === "ruins" || key === "camp"
      ) {
        return "wild";
      }
      if (
        key === "road" || key === "gate" ||
        key.includes("cross") || key.includes("ford") ||
        key.includes("switch") || key.includes("overlook")
      ) {
        return "road";
      }
      return "town";
    }
  }
  return "town";
}

addCmd({
  name: "+event",
  pattern: /^\+event(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+event — Roll a local happening here.\n` +
    `+event/town · /road · /wild — Force table.\n` +
    `+event/tables — List tables.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();

    if (sw === "tables" || sw === "list") {
      u.send("%ch%cyEVENT>>%cn Tables:");
      for (const t of listEventTables()) {
        u.send(`  ${t.slug}: ${t.name} (${t.bands.length} bands)`);
      }
      return;
    }

    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("Not in a room.");
      return;
    }
    const existing = await listHostiles(u, roomId);
    if (existing.length) {
      u.send(
        `%ch%crEVENT>>%cn ${existing.length} foe(s) already here.`,
      );
      return;
    }

    let table = sw;
    if (!table || table === "here" || table === "roll") {
      table = await guessTable(roomId);
    }
    if (!EVENT_TABLES[table]) {
      u.send("Unknown table. +event/tables");
      return;
    }

    const party = await countParty(u);
    const result = rollEvent(table, party.size);
    if (!result) {
      u.send("No event.");
      return;
    }

    u.send(
      `%ch%cyEVENT>>%cn [${table}] ${result.text}`,
    );

    if (result.kind === "fight") {
      for (const s of result.spawns) {
        await spawnMob(u, roomId, s.template, s.name);
      }
      u.send(
        `%ch%crEVENT>>%cn ${result.spawns.length} foe(s)! ` +
          `Combat!`,
      );
      await startRoomFight(u);
      return;
    }

    const notes = await applyEventBand(u, result.band);
    if (notes.length) {
      u.send(`  ${notes.join(" · ")}`);
    }
  },
});
