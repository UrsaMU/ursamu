/**
 * +travel — wilderness encounter check on path/woods rooms.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { defaultSheet, migrateSheet } from
  "../stats/dnd_sheet.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { countParty } from "../adventure/party.ts";
import {
  rollTravel,
  tableForWorldKey,
  ENCOUNTERS,
} from "../adventure/travel.ts";
import { getSeedRecord } from "../world/seed.ts";
import {
  listHostiles,
  startRoomFight,
} from "../combat/start-fight.ts";
import { roomIdOf } from "../combat/session.ts";

async function worldKeyOfRoom(
  roomId: string,
): Promise<string | null> {
  const seed = await getSeedRecord();
  if (!seed?.rooms) return null;
  for (const [k, id] of Object.entries(seed.rooms)) {
    if (id === roomId) return k;
  }
  return null;
}

async function spawnTravelMob(
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

  const npc = await u.db.create({
    flags: new Set(["thing", "npc"]),
    location: roomId,
    name: `${name};hostile;encounter`,
    state: {
      name,
      description: `A ${name} barred the path.`,
      dnd: sheet,
      owner: "1",
    },
  });
  if (t?.weapon) {
    await u.db.create({
      flags: new Set(["thing"]),
      location: npc.id,
      name: t.weapon.name,
      state: {
        name: t.weapon.name,
        dnd: {
          type: "weapon",
          damage: t.weapon.damage,
          damageType: t.weapon.damageType,
          properties: t.weapon.finesse ? ["finesse"] : [],
          weaponType: t.weapon.ranged ? "ranged" : "melee",
          equipped: true,
        },
      },
    });
  }
}

addCmd({
  name: "+travel",
  pattern: /^\+travel(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+travel — Check for wilderness encounters here.\n` +
    `+travel/tables — List encounter regions.\n` +
    `Works best on path, ruins, gate, camp (Havenbrook).`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();

    if (sw === "tables" || sw === "list") {
      u.send("%ch%cyTRAVEL>>%cn Regions:");
      for (const t of Object.values(ENCOUNTERS)) {
        u.send(
          `  ${t.slug}: ${t.name} (rooms: ${t.rooms.join(", ")}) ` +
            `chance ${Math.round(t.chance * 100)}%`,
        );
      }
      return;
    }

    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    // Already hostiles?
    const existing = await listHostiles(u, roomId);
    if (existing.length) {
      u.send(
        `%ch%crTRAVEL>>%cn ${existing.length} foe(s) already ` +
          `here. %ch+combat/start%cn`,
      );
      const fight = await startRoomFight(u);
      if (!fight.ok && fight.message) u.send(fight.message);
      return;
    }

    const wkey = await worldKeyOfRoom(roomId);
    const table = wkey
      ? tableForWorldKey(wkey)
      : ENCOUNTERS.whisperwood;
    if (!table) {
      u.send("No encounter table for this area.");
      return;
    }

    const party = await countParty(u);
    const result = rollTravel(table, party.size);
    u.send(
      `%ch%cyTRAVEL>>%cn ${table.name} check ` +
        `(party ${party.size})…`,
    );

    if (result.kind === "nothing" || result.kind === "flavor") {
      u.send(`%ch%cgTRAVEL>>%cn ${result.text}`);
      return;
    }

    u.broadcast(
      `%ch%crTRAVEL>>%cn ${u.util.displayName(u.me, u.me)}'s ` +
        `party is ambushed — ${result.label}!`,
    );
    for (const s of result.spawns) {
      await spawnTravelMob(u, roomId, s.template, s.name);
    }
    u.send(
      `%ch%crTRAVEL>>%cn ${result.spawns.length} foe(s) appear. ` +
        `Combat begins!`,
    );
    const fight = await startRoomFight(u);
    if (!fight.ok && fight.message) {
      u.send(fight.message);
    }
  },
});
