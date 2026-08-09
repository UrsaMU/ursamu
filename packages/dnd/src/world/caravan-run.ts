/**
 * Persist caravan escort state on player.
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  type CaravanRun,
  caravanBySlug,
  caravanComplete,
  startRun,
} from "./caravans.ts";
import { addRep, readRep } from "./reputation.ts";
import { addCoins } from "../stats/currency.ts";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { addXp as addXpSheet } from "../stats/rules.ts";

export function readCaravan(
  // deno-lint-ignore no-explicit-any
  state: any,
): CaravanRun | null {
  const c = state?.dndCaravan;
  if (!c || typeof c !== "object" || !c.slug) return null;
  return {
    slug: String(c.slug),
    legsDone: Number(c.legsDone) || 0,
    startedAt: Number(c.startedAt) || 0,
    lastLegAt: Number(c.lastLegAt) || 0,
  };
}

export async function saveCaravan(
  u: IUrsamuSDK,
  run: CaravanRun | null,
): Promise<void> {
  if (!run) {
    await u.db.modify(u.me.id, "$unset", {
      "data.dndCaravan": "",
    });
    // deno-lint-ignore no-explicit-any
    if (u.me.state) delete (u.me.state as any).dndCaravan;
    return;
  }
  await u.db.modify(u.me.id, "$set", {
    "data.dndCaravan": run,
  });
  // deno-lint-ignore no-explicit-any
  if (u.me.state) (u.me.state as any).dndCaravan = run;
}

export async function takeCaravan(
  u: IUrsamuSDK,
  slug: string,
): Promise<{ ok: boolean; message: string }> {
  const def = caravanBySlug(slug);
  if (!def) return { ok: false, message: "Unknown caravan." };
  const cur = readCaravan(u.me.state);
  if (cur) {
    return {
      ok: false,
      message: `Already escorting ${cur.slug}. +caravan/drop first.`,
    };
  }
  await saveCaravan(u, startRun(def.slug));
  return {
    ok: true,
    message:
      `Accepted ${def.name}. Walk the ${def.route} corridor ` +
      `and +caravan/leg each stretch (${def.legsRequired} legs). ` +
      `Pay ${def.payGp} gp / ${def.payXp} XP on +caravan/deliver.`,
  };
}

export async function deliverCaravan(
  u: IUrsamuSDK,
): Promise<{ ok: boolean; message: string }> {
  const run = readCaravan(u.me.state);
  if (!run) return { ok: false, message: "No active caravan." };
  const def = caravanBySlug(run.slug);
  if (!def) return { ok: false, message: "Unknown job." };
  if (!caravanComplete(def, run)) {
    return {
      ok: false,
      message:
        `Need ${def.legsRequired} legs ` +
        `(have ${run.legsDone}). +caravan/leg on the road.`,
    };
  }
  // deno-lint-ignore no-explicit-any
  let sheet = migrateSheet((u.me.state as any)?.dnd ?? {});
  sheet = addXpSheet(sheet, def.payXp);
  sheet = addCoins(sheet, def.payGp, "gp");
  const rep = addRep(readRep(u.me.state), def.faction, def.rep);
  await u.db.modify(u.me.id, "$set", {
    "data.dnd": sheet,
    "data.dndRep": rep,
  });
  // deno-lint-ignore no-explicit-any
  if (u.me.state) {
    // deno-lint-ignore no-explicit-any
    (u.me.state as any).dnd = sheet;
    // deno-lint-ignore no-explicit-any
    (u.me.state as any).dndRep = rep;
  }
  await saveCaravan(u, null);
  return {
    ok: true,
    message:
      `Delivered ${def.name}: +${def.payXp} XP, +${def.payGp} gp, ` +
      `${def.faction} rep +${def.rep}.`,
  };
}
