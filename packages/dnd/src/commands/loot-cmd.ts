/**
 * +loot / +get — corpses and gold piles.
 */
import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { addCoins } from "../stats/currency.ts";
import { roomIdOf } from "../combat/session.ts";
import { markClearedIfDone } from "../adventure/site.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function isCorpseObj(o: {
  name?: string;
  state?: Any;
}): boolean {
  const nameLc = o.name?.toLowerCase() || "";
  return o.state?.dnd?.type === "corpse" ||
    nameLc.includes("corpse of") ||
    nameLc.includes("remains of") ||
    nameLc.includes("body of") ||
    nameLc.includes("mangled corpse");
}

function isGoldPile(o: {
  name?: string;
  state?: Any;
}): boolean {
  const n = (o.name || "").toLowerCase();
  return n.includes("gold coin") || n.includes(" gp") ||
    (o.state?.dnd?.value && n.includes("gold"));
}

async function lootCorpse(
  u: IUrsamuSDK,
  targetObj: { id: string; name?: string; state?: unknown },
): Promise<string[]> {
  // deno-lint-ignore no-explicit-any
  const items = await u.db.search({
    location: targetObj.id,
  } as any);
  const lootNames: string[] = [];
  let sheet = migrateSheet((u.me.state as Any)?.dnd);
  let goldGained = 0;

  for (const item of items) {
    if (!item.flags.has("thing")) continue;
    const itemLc = item.name?.toLowerCase() || "";
    if (itemLc.includes("gold coin")) {
      const val = ((item.state as Any).dnd?.value as number) ||
        parseInt(item.name || "", 10) || 0;
      goldGained += val;
      await u.db.destroy(item.id);
    } else {
      await u.db.modify(item.id, "$set", {
        location: u.me.id,
      });
      lootNames.push(item.name || "Item");
    }
  }
  if (goldGained > 0) {
    sheet = addCoins(sheet, goldGained, "gp");
    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
    if (u.me.state) (u.me.state as Any).dnd = sheet;
    lootNames.push(`${goldGained} gp`);
  }
  await u.db.destroy(targetObj.id);
  return lootNames;
}

async function lootRoomGold(
  u: IUrsamuSDK,
  roomId: string,
): Promise<number> {
  // deno-lint-ignore no-explicit-any
  const items = await u.db.search({ location: roomId } as any);
  let gold = 0;
  let sheet = migrateSheet((u.me.state as Any)?.dnd);
  for (const item of items) {
    if (!item.flags.has("thing")) continue;
    if (!isGoldPile(item)) continue;
    const val = ((item.state as Any).dnd?.value as number) ||
      parseInt(item.name || "", 10) || 0;
    gold += val;
    await u.db.destroy(item.id);
  }
  if (gold > 0) {
    sheet = addCoins(sheet, gold, "gp");
    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
    if (u.me.state) (u.me.state as Any).dnd = sheet;
  }
  return gold;
}

async function afterLoot(u: IUrsamuSDK): Promise<void> {
  const adv = (u.me.state as Any)?.dndAdv?.slug as
    | string
    | undefined;
  if (adv) {
    const done = await markClearedIfDone(adv);
    if (done) {
      u.send(
        "Site cleared! %chopen%cn hoards, then %ch+adv/leave%cn.",
      );
      try {
        const { onDelveCleared } = await import(
          "../world/bounty-progress.ts"
        );
        const tip = await onDelveCleared(u, adv);
        if (tip) u.send(tip);
      } catch (_e: unknown) { /* optional */ }
    }
  }
  u.send(
    "Sell gear in town: %ch+list%cn then " +
      "%ch+sell <item>%cn at a vendor.",
  );
}

addCmd({
  name: "+loot",
  pattern: /^\+(?:loot|get)(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Dnd",
  help:
    `+loot | +get — Loot everything useful here.\n` +
    `+loot <corpse> — Loot one corpse.\n` +
    `Picks up gold piles; corpses drop gear to inventory.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = roomIdOf(u);
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const targetArg = u.util.stripSubs(u.cmd.args[0] || "")
      .trim();

    if (
      targetArg &&
      !["all", "here", "room", "everything"].includes(
        targetArg.toLowerCase(),
      )
    ) {
      const targetObj = await u.util.target(u.me, targetArg);
      if (!targetObj || targetObj.location !== roomId) {
        u.send(`Nothing to loot matching "${targetArg}".`);
        return;
      }
      if ((targetObj.state as Any)?.dnd?.type === "chest") {
        u.send(`Try %chopen ${targetArg}%cn.`);
        return;
      }
      if (!isCorpseObj(targetObj)) {
        if (targetObj.flags.has("thing")) {
          await u.db.modify(targetObj.id, "$set", {
            location: u.me.id,
          });
          u.send(
            `You pick up ${targetObj.name?.split(";")[0]}.`,
          );
          await afterLoot(u);
          return;
        }
        u.send("That is not a corpse or loot pile.");
        return;
      }
      const names = await lootCorpse(u, targetObj);
      const displayName = u.util.displayName(targetObj, u.me);
      if (!names.length) {
        u.send(`Nothing on ${displayName}.`);
      } else {
        u.send(
          `You loot ${names.join(", ")} from ${displayName}.`,
        );
        u.broadcast(
          `${u.util.displayName(u.me, u.me)} loots ${displayName}.`,
          { exclude: [u.me.id] } as Record<string, unknown>,
        );
      }
      await afterLoot(u);
      return;
    }

    // deno-lint-ignore no-explicit-any
    const here = await u.db.search({ location: roomId } as any);
    const corpses = here.filter(isCorpseObj);
    const summary: string[] = [];
    for (const c of corpses) {
      const names = await lootCorpse(u, c);
      if (names.length) {
        summary.push(
          `${(c.name || "?").split(";")[0]}: ${names.join(", ")}`,
        );
      }
    }
    const gp = await lootRoomGold(u, roomId);
    if (gp > 0) summary.push(`${gp} gp from the floor`);

    if (!summary.length) {
      u.send(
        "Nothing to loot. Try +loot <corpse> or " +
          "open <chest>.",
      );
      return;
    }
    u.send(summary.join(" · "));
    u.broadcast(
      `${u.util.displayName(u.me, u.me)} loots the area.`,
      { exclude: [u.me.id] } as Record<string, unknown>,
    );
    await afterLoot(u);
  },
});
