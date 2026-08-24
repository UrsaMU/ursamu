/**
 * Apply rolled event boons/risks to player sheet.
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { EventBand } from "./events.ts";
import {
  addCoins,
  spendCoins,
  formatPurse,
} from "../stats/currency.ts";
import { migrateSheet, defaultSheet } from
  "../stats/dnd_sheet.ts";
import { setInspiration } from "../stats/rules.ts";

export async function applyEventBand(
  u: IUrsamuSDK,
  band: EventBand,
): Promise<string[]> {
  const notes: string[] = [];
  // deno-lint-ignore no-explicit-any
  let sheet = migrateSheet(
    // deno-lint-ignore no-explicit-any
    (u.me.state as any)?.dnd ?? defaultSheet(),
  );
  let dirty = false;

  if (band.gp && band.gp > 0) {
    sheet = addCoins(sheet, band.gp, "gp");
    dirty = true;
    notes.push(`+${band.gp} gp`);
  }
  if (band.gpLoss && band.gpLoss > 0) {
    const next = spendCoins(sheet, band.gpLoss, "gp");
    if (next) {
      sheet = next;
      dirty = true;
      notes.push(`-${band.gpLoss} gp`);
    } else {
      notes.push("(purse empty — no loss)");
    }
  }
  if (band.inspiration) {
    sheet = setInspiration(sheet, true);
    dirty = true;
    notes.push("inspiration");
  }
  if (dirty) {
    await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
    // deno-lint-ignore no-explicit-any
    if (u.me.state) (u.me.state as any).dnd = sheet;
    notes.push(`purse ${formatPurse(sheet)}`);
  }
  if (band.hint) {
    notes.push(`hint: +${band.hint}`);
  }
  return notes;
}
