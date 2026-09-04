/**
 * +road — overland routes between towns.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/mush";
import { listRoutes, routeBySlug } from "../world/routes.ts";
import {
  ENCOUNTERS,
  rollTravel,
} from "../adventure/travel.ts";
import { countParty } from "../adventure/party.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { defaultSheet, migrateSheet } from
  "../stats/dnd_sheet.ts";
import {
  listHostiles,
  startRoomFight,
} from "../combat/start-fight.ts";
import { roomIdOf } from "../combat/session.ts";
import {
  getTownSeed,
  WORLD,
} from "../world/seed.ts";
import { campaignStatus } from "../world/campaign.ts";

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
    sheet.abilities = {
      strength: t.abilities.strength ?? 10,
      dexterity: t.abilities.dexterity ?? 10,
      constitution: t.abilities.constitution ?? 10,
      intelligence: t.abilities.intelligence ?? 10,
      wisdom: t.abilities.wisdom ?? 10,
      charisma: t.abilities.charisma ?? 10,
    };
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
    name: `${name};hostile;road`,
    state: {
      name,
      description: `A ${name} on the road.`,
      dnd: sheet,
      owner: "1",
    },
  });
}

addCmd({
  name: "+road",
  pattern: /^\+road(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+road — List overland routes.\n` +
    `+road/go <route|town> — Status / tip from here.\n` +
    `+road/check — Encounter check on road legs.\n` +
    `Walk exits along the Whisperwood Road corridor.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "status" || sw === "towns") {
      const lines = await campaignStatus();
      u.send("%ch%cyROAD>>%cn Campaign:");
      for (const l of lines) u.send(l);
      return;
    }

    if (sw === "check" || sw === "scout") {
      const roomId = roomIdOf(u);
      if (!roomId) {
        u.send("Not in a room.");
        return;
      }
      const existing = await listHostiles(u, roomId);
      if (existing.length) {
        u.send(
          `%ch%crROAD>>%cn ${existing.length} foe(s) here. ` +
            `+combat/start`,
        );
        await startRoomFight(u);
        return;
      }
      const party = await countParty(u);
      const table = ENCOUNTERS.whisperwood;
      if (!table) {
        u.send("No road encounter table.");
        return;
      }
      const result = rollTravel(table, party.size);
      u.send(
        `%ch%cyROAD>>%cn Scouting (party ${party.size})…`,
      );
      if (result.kind !== "fight") {
        u.send(`%ch%cgROAD>>%cn ${result.text}`);
        return;
      }
      u.broadcast(
        `%ch%crROAD>>%cn Ambush — ${result.label}!`,
      );
      for (const s of result.spawns) {
        await spawnMob(u, roomId, s.template, s.name);
      }
      u.send(
        `%ch%crROAD>>%cn ${result.spawns.length} foe(s). ` +
          `Combat!`,
      );
      await startRoomFight(u);
      return;
    }

    if (sw === "go" || sw === "to") {
      const r = arg
        ? routeBySlug(arg) ||
          listRoutes().find((x) =>
            x.toTown.includes(arg.toLowerCase()) ||
            x.fromTown.includes(arg.toLowerCase()) ||
            x.name.toLowerCase().includes(arg.toLowerCase())
          )
        : listRoutes()[0];
      if (!r) {
        u.send("Unknown route. +road for list.");
        return;
      }
      const from = await getTownSeed(r.fromTown);
      const to = await getTownSeed(r.toTown);
      u.send(
        `%ch%cyROAD>>%cn ${r.name} — ` +
          `${r.fromTown} (${r.fromRoom}) ↔ ` +
          `${r.toTown} (${r.toRoom})`,
      );
      u.send(
        `  Legs: ${r.legs.map((l) => l.name).join(" → ")}`,
      );
      u.send(
        from && to
          ? "  Both towns seeded. Walk the road exits, " +
            "or +road/check on legs."
          : "  Seed incomplete. Staff: +dnd/world/seed",
      );
      // Convenience teleport tip from matching endpoint
      const roomId = roomIdOf(u);
      if (roomId && from?.rooms[r.fromRoom] === roomId) {
        u.send(
          `  You are at the ${WORLD.name} end. ` +
            `Exit toward Millhaven.`,
        );
      }
      if (roomId && to?.rooms[r.toRoom] === roomId) {
        u.send("  You are at the Millhaven end.");
      }
      return;
    }

    u.send("%ch%cyROAD>>%cn Overland routes:");
    for (const r of listRoutes()) {
      u.send(
        `  ${r.slug.padEnd(14)} ${r.name} — ` +
          `${r.legs.length} legs`,
      );
      u.send(
        `    ${r.fromTown} → ${r.toTown}` +
          (r.encounter ? ` [${r.encounter}]` : ""),
      );
    }
    u.send(
      "  +road/go haven-mill · +road/check · +road/status",
    );
  },
});
