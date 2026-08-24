/**
 * +hire — cheap companion NPCs that count toward delve party size.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { migrateSheet, defaultSheet } from
  "../stats/dnd_sheet.ts";
import { spendCoins, formatPurse } from
  "../stats/currency.ts";
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";
import { readRep } from "../world/reputation.ts";
import {
  applyHireDiscount,
  hireDiscountFromRep,
} from "../world/unlocks.ts";

type HireKit = {
  key: string;
  label: string;
  template: string;
  costGp: number;
  blurb: string;
};

const KITS: HireKit[] = [
  {
    key: "guard",
    label: "Guard",
    template: "bandit",
    costGp: 25,
    blurb: "Sturdy blade for hire.",
  },
  {
    key: "scout",
    label: "Scout",
    template: "scout",
    costGp: 30,
    blurb: "Eyes on the trail.",
  },
  {
    key: "porter",
    label: "Porter",
    template: "commoner",
    costGp: 5,
    blurb: "Carries gear; frail in a fight.",
  },
  {
    key: "acolyte",
    label: "Acolyte",
    template: "acolyte",
    costGp: 40,
    blurb: "Minor prayers and a club.",
  },
];

function kitByKey(raw: string): HireKit | undefined {
  const t = raw.toLowerCase().trim();
  return KITS.find((k) => k.key === t || k.label.toLowerCase() === t);
}

function roomIdOf(u: IUrsamuSDK): string | null {
  return u.here?.id ?? u.me.location ?? null;
}

addCmd({
  name: "+hire",
  pattern: /^\+hire(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+hire — List hire kits.\n` +
    `+hire <kit> — Pay gp, spawn companion here.\n` +
    `+hire/dismiss <name> — Release your hireling.\n` +
    `+hire/list — Your hirelings in this room.\n` +
    `Hirelings count toward +adv/delve party size.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "list" || sw === "mine") {
      const roomId = roomIdOf(u);
      if (!roomId) {
        u.send("You are not in a room.");
        return;
      }
      const here = await u.db.search({ location: roomId });
      const mine = here.filter((o) => {
        // deno-lint-ignore no-explicit-any
        const d = (o.state as any)?.dnd;
        return d?.hireling && d?.leaderId === u.me.id;
      });
      if (!mine.length) {
        u.send("%ch%cyHIRE>>%cn No hirelings here.");
        return;
      }
      u.send("%ch%cyHIRE>>%cn Your companions:");
      for (const o of mine) {
        u.send(`  ${o.name?.split(";")[0]} (#${o.id})`);
      }
      return;
    }

    if (sw === "dismiss" || sw === "fire") {
      if (!arg) {
        u.send("Usage: +hire/dismiss <name>");
        return;
      }
      const t = await u.util.target(u.me, arg);
      // deno-lint-ignore no-explicit-any
      const d = (t?.state as any)?.dnd;
      if (!t || !d?.hireling || d.leaderId !== u.me.id) {
        u.send("That is not your hireling.");
        return;
      }
      await u.db.destroy(t.id);
      u.send(
        `%ch%cyHIRE>>%cn ${t.name?.split(";")[0]} is released.`,
      );
      return;
    }

    if (!sw && !arg) {
      const rep = readRep(u.me.state);
      const hd = hireDiscountFromRep(rep);
      u.send("%ch%cyHIRE>>%cn Kits (pay gp, join your party):");
      for (const k of KITS) {
        const cost = applyHireDiscount(k.costGp, rep);
        const tag = cost < k.costGp
          ? ` ${cost}gp (was ${k.costGp})`
          : ` ${k.costGp} gp`;
        u.send(
          `  ${k.key.padEnd(8)}${tag} — ${k.label}: ` +
            k.blurb,
        );
      }
      if (hd > 0) {
        u.send(
          `  Rep hire discount: ${Math.round(hd * 100)}%`,
        );
      }
      u.send("Hire: +hire guard   Dismiss: +hire/dismiss Name");
      return;
    }

    const key = sw && !["list", "dismiss"].includes(sw)
      ? sw
      : arg;
    const kit = kitByKey(key);
    if (!kit) {
      u.send(`Unknown kit "${key}". +hire for list.`);
      return;
    }

    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    let sheet = migrateSheet(
      // deno-lint-ignore no-explicit-any
      (u.me.state as any)?.dnd ?? defaultSheet(),
    );
    const rep = readRep(u.me.state);
    const cost = applyHireDiscount(kit.costGp, rep);
    const paid = spendCoins(sheet, cost, "gp");
    if (!paid) {
      u.send(
        `Need ${cost} gp (have ${formatPurse(sheet)}).`,
      );
      return;
    }
    sheet = paid;
    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });

    const tmpl = NPC_TEMPLATES[kit.template];
    const hs = migrateSheet(defaultSheet());
    hs.class = "Hireling";
    if (tmpl) {
      hs.hp = {
        max: tmpl.hp,
        current: tmpl.hp,
        temp: 0,
      };
      hs.ac = tmpl.ac;
      hs.xp = 0;
      hs.abilities = {
        strength: tmpl.abilities.strength ?? 10,
        dexterity: tmpl.abilities.dexterity ?? 10,
        constitution: tmpl.abilities.constitution ?? 10,
        intelligence: tmpl.abilities.intelligence ?? 10,
        wisdom: tmpl.abilities.wisdom ?? 10,
        charisma: tmpl.abilities.charisma ?? 10,
      };
    } else {
      hs.hp = { max: 8, current: 8, temp: 0 };
    }
    // deno-lint-ignore no-explicit-any
    (hs as any).hireling = true;
    // deno-lint-ignore no-explicit-any
    (hs as any).leaderId = u.me.id;
    // deno-lint-ignore no-explicit-any
    (hs as any).aiKey = "aggressive";

    const who = u.util.displayName(u.me, u.me);
    const hname = `${kit.label} of ${who};hireling;${kit.key}`;
    const npc = await u.db.create({
      flags: new Set(["thing", "npc"]),
      location: roomId,
      name: hname,
      state: {
        name: `${kit.label} of ${who}`,
        description:
          `A hired ${kit.label.toLowerCase()}. ` +
          `Follows ${who} into danger.`,
        dnd: hs,
        owner: u.me.id,
      },
    });

    if (tmpl?.weapon) {
      await u.db.create({
        flags: new Set(["thing"]),
        location: npc.id,
        name: tmpl.weapon.name,
        state: {
          name: tmpl.weapon.name,
          dnd: {
            type: "weapon",
            damage: tmpl.weapon.damage,
            damageType: tmpl.weapon.damageType,
            properties: tmpl.weapon.finesse
              ? ["finesse"]
              : [],
            weaponType: tmpl.weapon.ranged
              ? "ranged"
              : "melee",
            equipped: true,
          },
          owner: npc.id,
        },
      });
    }

    u.send(
      `%ch%cyHIRE>>%cn Hired %ch${kit.label}%cn for ` +
        `${kit.costGp} gp (#${npc.id}). ` +
        `Purse: ${formatPurse(sheet)}.`,
    );
    u.send(
      "They count toward +adv/delve party size and follow " +
        "you into delves.",
    );
  },
});
