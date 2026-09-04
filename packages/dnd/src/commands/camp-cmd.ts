/**
 * +camp — claim / upgrade player camps into settlements.
 */
import { addCmd, DBO, type IUrsamuSDK } from "@ursamu/mush";
import { roomIdOf } from "../combat/session.ts";
import { spendCoins, formatPurse } from "../stats/currency.ts";
import { migrateSheet, defaultSheet } from
  "../stats/dnd_sheet.ts";
import { getSeedRecord } from "../world/seed.ts";

type CampStage = "camp" | "outpost" | "hamlet";

interface CampRec {
  id: string;
  name: string;
  roomId: string;
  ownerId: string;
  stage: CampStage;
  at: number;
}

const camps = new DBO<CampRec>("dnd.camps");

const STAGE_ORDER: CampStage[] = ["camp", "outpost", "hamlet"];

const UPGRADE_COST: Record<CampStage, number> = {
  camp: 0,
  outpost: 100,
  hamlet: 400,
};

const STAGE_BLURB: Record<CampStage, string> = {
  camp: "Secure rest site (long rest OK).",
  outpost: "Watch post + supply cache.",
  hamlet: "Tiny settlement with a shop stall.",
};

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function nextStage(s: CampStage): CampStage | null {
  const i = STAGE_ORDER.indexOf(s);
  if (i < 0 || i >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1]!;
}

addCmd({
  name: "+camp",
  pattern: /^\+camp(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+camp — Status of camp here.\n` +
    `+camp/found <name> — Claim this room as your camp.\n` +
    `+camp/upgrade — Pay gp to grow camp→outpost→hamlet.\n` +
    `+camp/list — Your camps.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const roomId = roomIdOf(u);

    if (sw === "list" || sw === "mine") {
      const all = await camps.all();
      const mine = all.filter((c) => c.ownerId === u.me.id);
      if (!mine.length) {
        u.send("%ch%cyCAMP>>%cn You have no camps.");
        return;
      }
      u.send("%ch%cyCAMP>>%cn Your camps:");
      for (const c of mine) {
        u.send(
          `  ${c.name} (#${c.roomId}) — ${c.stage} — ` +
            STAGE_BLURB[c.stage],
        );
      }
      return;
    }

    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const here = (await camps.all()).find((c) =>
      c.roomId === roomId
    );

    if (!sw || sw === "status" || sw === "here") {
      if (!here) {
        u.send(
          "%ch%cyCAMP>>%cn No camp here. " +
            "+camp/found <name> to claim.",
        );
        return;
      }
      const nxt = nextStage(here.stage);
      u.send(
        `%ch%cyCAMP>>%cn ${here.name} — %ch${here.stage}%cn. ` +
          STAGE_BLURB[here.stage],
      );
      if (nxt) {
        u.send(
          `  Upgrade to ${nxt}: ${UPGRADE_COST[nxt]} gp ` +
            `(+camp/upgrade)`,
        );
      } else {
        u.send("  Fully upgraded (hamlet).");
      }
      return;
    }

    if (sw === "found" || sw === "claim" || sw === "found") {
      if (here) {
        u.send(
          `Already claimed as ${here.name} (${here.stage}).`,
        );
        return;
      }
      // Block claiming core Havenbrook civic rooms
      const seed = await getSeedRecord();
      const civic = new Set([
        "square", "forge", "inn", "temple", "barracks",
      ]);
      if (seed?.rooms) {
        for (const [k, id] of Object.entries(seed.rooms)) {
          if (id === roomId && civic.has(k)) {
            u.send(
              "Cannot claim civic Havenbrook ground. " +
                "Try path, ruins, or a delve exit.",
            );
            return;
          }
        }
      }
      const name = arg || "Wayside Camp";
      const rec: CampRec = {
        id: `camp-${roomId}`,
        name,
        roomId,
        ownerId: u.me.id,
        stage: "camp",
        at: Date.now(),
      };
      await camps.update({ id: rec.id }, rec);
      try {
        await u.db.modify(roomId, "$set", {
          "data.dndCamp": rec.id,
        });
      } catch (_e: unknown) {
        /* room tag optional on bare rooms */
      }
      u.broadcast(
        `%ch%cyCAMP>>%cn ${u.util.displayName(u.me, u.me)} ` +
          `founds %ch${name}%cn.`,
      );
      u.send(
        `%ch%cgCAMP>>%cn Camp founded. Long rests feel safer. ` +
          `Upgrade later with +camp/upgrade.`,
      );
      return;
    }

    if (sw === "upgrade") {
      if (!here) {
        u.send("No camp here. +camp/found first.");
        return;
      }
      if (here.ownerId !== u.me.id && !isStaff(u)) {
        u.send("Only the founder (or staff) can upgrade.");
        return;
      }
      const nxt = nextStage(here.stage);
      if (!nxt) {
        u.send("Already a hamlet.");
        return;
      }
      const cost = UPGRADE_COST[nxt];
      let sheet = migrateSheet(
        // deno-lint-ignore no-explicit-any
        (u.me.state as any)?.dnd ?? defaultSheet(),
      );
      const paid = spendCoins(sheet, cost, "gp");
      if (!paid) {
        u.send(
          `Need ${cost} gp (have ${formatPurse(sheet)}).`,
        );
        return;
      }
      sheet = paid;
      await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
      here.stage = nxt;
      here.at = Date.now();
      await camps.update({ id: here.id }, here);

      if (nxt === "hamlet") {
        // Spawn a small stall vendor
        await u.db.create({
          flags: new Set(["thing"]),
          location: roomId,
          name: `${here.name} Stall;vendor;shop`,
          state: {
            name: `${here.name} Stall`,
            description: "A rough stall of local trade.",
            vendor: {
              inventory: [
                { name: "Rations", price: 2, spec: "general" },
                { name: "Torch", price: 1, spec: "general" },
                {
                  name: "Dagger",
                  price: 2,
                  spec: "weapon:1d4:piercing:finesse,thrown",
                },
                {
                  name: "Healer's Kit",
                  price: 5,
                  spec: "general",
                },
              ],
              desc: `Market stall of ${here.name}.`,
            },
            owner: u.me.id,
          },
        });
      }

      u.broadcast(
        `%ch%cgCAMP>>%cn ${here.name} grows into a ` +
          `%ch${nxt}%cn!`,
      );
      u.send(
        `%ch%cgCAMP>>%cn Paid ${cost} gp. ` +
          STAGE_BLURB[nxt] +
          (nxt === "hamlet" ? " A stall opens — +list." : ""),
      );
      return;
    }

    u.send("Switches: /found /upgrade /list /status");
  },
});
