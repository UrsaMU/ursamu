/**
 * Open a D&D treasure chest (shared by `open` and +chest).
 */
import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { addCoins } from "../stats/currency.ts";
import { rollTreasureSlug } from "../adventure/treasure.ts";
import { spawnLootItem } from "../adventure/spawn-item.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export async function openDndChest(
  u: IUrsamuSDK,
  target: IDBObj,
): Promise<{ ok: boolean; message?: string }> {
  // deno-lint-ignore no-explicit-any
  const dnd = (target.state as any)?.dnd;
  if (!dnd || dnd.type !== "chest") {
    return { ok: false, message: "That is not a chest." };
  }
  if (dnd.opened) {
    return { ok: false, message: "Already open and empty." };
  }
  const table = String(dnd.table || "scrap");
  const loot = rollTreasureSlug(table);
  if (!loot) {
    return {
      ok: false,
      message: `Unknown loot table "${table}".`,
    };
  }
  dnd.opened = true;
  await u.db.modify(target.id, "$set", { "data.dnd": dnd });
  // deno-lint-ignore no-explicit-any
  if (target.state) (target.state as any).dnd = dnd;

  const cname = u.util.displayName(target, u.me);
  if (!loot.lines.length) {
    u.send(`${cname} is empty.`);
    return { ok: true };
  }
  u.broadcast(
    `%ch${u.util.displayName(u.me, u.me)}%cn opens ` +
      `%ch${cname}%cn: ${loot.lines.join(", ")}.`,
  );
  if (loot.gp > 0) {
    let sheet = migrateSheet((u.me.state as Any)?.dnd);
    sheet = addCoins(sheet, loot.gp, "gp");
    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
    if (u.me.state) (u.me.state as Any).dnd = sheet;
    u.send(`You pocket %ch${loot.gp} gp%cn.`);
  }
  for (const it of loot.items) {
    await spawnLootItem(
      u,
      u.me.id,
      it.name,
      it.type,
      u.me.id,
      it.extra ?? {},
    );
  }
  if (loot.items.length) {
    u.send(
      `To inventory: ` +
        loot.items.map((i) => i.name).join(", ") + ".",
    );
  }
  return { ok: true };
}
