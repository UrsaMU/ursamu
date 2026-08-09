/**
 * Use altar / campfire (shared by `use` and +altar).
 */
import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { applyHeal as healSheet } from "../stats/vitality.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export async function useDndProp(
  u: IUrsamuSDK,
  target: IDBObj,
): Promise<{ ok: boolean; message?: string }> {
  const d = (target.state as Any)?.dnd;
  if (!d || (d.type !== "altar" && d.type !== "campfire")) {
    return {
      ok: false,
      message: "That is not an altar or campfire.",
    };
  }
  if (d.used) {
    return { ok: false, message: "Its power is spent." };
  }
  d.used = true;
  await u.db.modify(target.id, "$set", { "data.dnd": d });
  if (target.state) (target.state as Any).dnd = d;

  let sheet = migrateSheet((u.me.state as Any)?.dnd);
  if (d.type === "campfire") {
    const h = healSheet(sheet, 5);
    sheet = h.sheet;
    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
    if (u.me.state) (u.me.state as Any).dnd = sheet;
    u.send(
      `You warm yourself. Recovered %ch5%cn HP ` +
        `(${sheet.hp.current}/${sheet.hp.max}).`,
    );
    return { ok: true };
  }

  const roll = 1 + Math.floor(Math.random() * 8);
  const h = healSheet(sheet, roll);
  sheet = h.sheet;
  await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
  if (u.me.state) (u.me.state as Any).dnd = sheet;
  u.broadcast(
    `%ch${u.util.displayName(u.me, u.me)}%cn touches ` +
      `%ch${u.util.displayName(target, u.me)}%cn.`,
  );
  u.send(
    `A faint warmth. Healed %ch${roll}%cn ` +
      `(${sheet.hp.current}/${sheet.hp.max}).`,
  );
  return { ok: true };
}
