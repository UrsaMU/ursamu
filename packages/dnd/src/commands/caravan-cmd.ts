/**
 * +caravan — escort jobs along seeded roads.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  caravanBySlug,
  listCaravans,
  progressLine,
  advanceLeg,
  caravanComplete,
} from "../world/caravans.ts";
import {
  deliverCaravan,
  readCaravan,
  saveCaravan,
  takeCaravan,
} from "../world/caravan-run.ts";
import { ENCOUNTERS, rollTravel } from
  "../adventure/travel.ts";
import { countParty } from "../adventure/party.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { defaultSheet, migrateSheet } from
  "../stats/dnd_sheet.ts";
import {
  listHostiles,
  startRoomFight,
} from "../combat/start-fight.ts";
import { roomIdOf } from "../combat/session.ts";
import { routeBySlug } from "../world/routes.ts";

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
    name: `${name};hostile;caravan`,
    state: {
      name,
      dnd: sheet,
      owner: "1",
    },
  });
}

addCmd({
  name: "+caravan",
  pattern: /^\+caravan(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+caravan — List escort jobs.\n` +
    `+caravan/take <slug> — Accept (one at a time).\n` +
    `+caravan/leg — Advance one road leg (may ambush).\n` +
    `+caravan/deliver — Collect pay when legs done.\n` +
    `+caravan/status · +caravan/drop`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "take" || sw === "accept") {
      if (!arg) {
        u.send("Usage: +caravan/take <slug>");
        return;
      }
      const r = await takeCaravan(u, arg);
      u.send(
        r.ok
          ? `%ch%cyCARAVAN>>%cn ${r.message}`
          : `%ch%crCARAVAN>>%cn ${r.message}`,
      );
      return;
    }

    if (sw === "drop" || sw === "abandon") {
      await saveCaravan(u, null);
      u.send("%ch%cyCARAVAN>>%cn Escort abandoned.");
      return;
    }

    if (sw === "status" || sw === "mine") {
      const run = readCaravan(u.me.state);
      if (!run) {
        u.send("%ch%cyCARAVAN>>%cn No active escort.");
        return;
      }
      const def = caravanBySlug(run.slug)!;
      u.send(
        `%ch%cyCARAVAN>>%cn ${def.name} — ` +
          progressLine(def, run),
      );
      u.send(`  ${def.summary}`);
      return;
    }

    if (sw === "deliver" || sw === "pay" || sw === "turnin") {
      const r = await deliverCaravan(u);
      u.send(
        r.ok
          ? `%ch%cgCARAVAN>>%cn ${r.message}`
          : `%ch%cyCARAVAN>>%cn ${r.message}`,
      );
      return;
    }

    if (sw === "leg" || sw === "advance" || sw === "next") {
      const run = readCaravan(u.me.state);
      if (!run) {
        u.send("No active caravan. +caravan/take <slug>");
        return;
      }
      const def = caravanBySlug(run.slug);
      if (!def) {
        u.send("Broken job — +caravan/drop");
        return;
      }
      if (caravanComplete(def, run)) {
        u.send("Legs done — +caravan/deliver for pay.");
        return;
      }
      const roomId = roomIdOf(u);
      if (!roomId) {
        u.send("Not in a room.");
        return;
      }
      const hostiles = await listHostiles(u, roomId);
      if (hostiles.length) {
        u.send(
          "Clear foes first (+combat), then +caravan/leg.",
        );
        return;
      }

      // Encounter chance on this leg
      const party = await countParty(u);
      const route = routeBySlug(def.route);
      const tableKey = route?.encounter || "whisperwood";
      const table = ENCOUNTERS[tableKey] ??
        ENCOUNTERS.whisperwood!;
      const forced = {
        ...table,
        chance: def.encounterChance,
      };
      const result = rollTravel(forced, party.size);
      if (result.kind === "fight") {
        u.broadcast(
          `%ch%crCARAVAN>>%cn Wagon ambush — ${result.label}!`,
        );
        for (const s of result.spawns) {
          await spawnMob(u, roomId, s.template, s.name);
        }
        u.send(
          `%ch%crCARAVAN>>%cn Defend the cargo! ` +
            `After the fight: +caravan/leg again.`,
        );
        await startRoomFight(u);
        return;
      }

      const next = advanceLeg(run);
      await saveCaravan(u, next);
      u.send(
        `%ch%cgCARAVAN>>%cn ${result.kind === "nothing" ||
            result.kind === "flavor"
          ? result.text
          : "The wagons roll on."}`,
      );
      u.send(
        `  Progress ${progressLine(def, next)}` +
          (caravanComplete(def, next)
            ? " — +caravan/deliver!"
            : ""),
      );
      return;
    }

    const run = readCaravan(u.me.state);
    u.send("%ch%cyCARAVAN>>%cn Escort board:");
    for (const c of listCaravans()) {
      const mark = run?.slug === c.slug ? "*" : " ";
      u.send(
        ` ${mark}${c.slug.padEnd(14)} T${c.tier} ` +
          `${c.name} (${c.payGp}gp/${c.payXp}xp)`,
      );
      u.send(`   ${c.summary}`);
    }
    if (run) {
      const d = caravanBySlug(run.slug);
      if (d) {
        u.send(`Active: ${progressLine(d, run)}`);
      }
    }
    u.send(
      "Take +caravan/take · Leg +caravan/leg · " +
        "Pay +caravan/deliver",
    );
  },
});
