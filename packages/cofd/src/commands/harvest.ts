// +harvest / +reap — Glamour economy (CtL pp.103–104).

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import { applyHarvest, applyReap } from "../glamour/index.ts";
import { isChangelingSheet } from "../form/mask.ts";
import {
  executeRoll,
  parseRollExpression,
} from "../roller/index.ts";
import {
  getSheet,
  persistSheet,
} from "./hedge_helpers.ts";
import { migrateSheet, type CofdSheet } from "../stats/index.ts";

function isFaeTarget(obj: IDBObj): boolean {
  const sheet = getSheet(obj);
  if (sheet && isChangelingSheet(sheet)) return true;
  const f = obj.flags as Set<string> | undefined;
  if (f?.has("fae") || f?.has("hobgoblin")) return true;
  const t = (sheet?.template ?? "").toLowerCase();
  return t === "fetch" || t === "huntsman";
}

/** +harvest [target][=pool] — Attr+Skill; Glamour = successes. */
export async function harvestExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (sw === "reap") {
    return await reapExec(u, rest);
  }

  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings harvest Glamour.");
    return;
  }

  // rest may be target, pool, or target=pool
  const arg = rest || sw;
  let targetName = "";
  let poolExpr = "Presence+Empathy";
  if (arg) {
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      targetName = arg.slice(0, eq).trim();
      poolExpr = arg.slice(eq + 1).trim() || poolExpr;
    } else if (arg.includes("+")) {
      poolExpr = arg;
    } else {
      targetName = arg;
    }
  }

  let fromFae = false;
  let targetLabel = "the scene";
  if (targetName) {
    const t = await u.util.target(u.me, targetName, true);
    if (!t) {
      u.send(`No one matches '${targetName}'.`);
      return;
    }
    fromFae = isFaeTarget(t);
    targetLabel = u.util.displayName(t, u.me);
  }

  const parsed = parseRollExpression(poolExpr, sheet);
  if (parsed.error) {
    u.send(`Pool error: ${parsed.error}`);
    return;
  }
  const roll = executeRoll(parsed.pool);
  const lines = [
    `Harvest from %cy${targetLabel}%cn ` +
      `(${poolExpr} ${parsed.pool}d → ${roll.successes}).`,
  ];
  const r = applyHarvest(sheet, roll.successes, { fromFae });
  if (!r.ok || !r.sheet) {
    u.send([...lines, r.reason ?? "Harvest failed."].join("\n"));
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  u.send([...lines, ...r.lines].join("\n"));
}

/** +reap <target> — fill Glamour; WP drain + Ravaged + BP. */
export async function reapExec(
  u: IUrsamuSDK,
  restRaw: string,
): Promise<void> {
  const rest = u.util.stripSubs(restRaw).trim();
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings reap Glamour.");
    return;
  }
  if (!rest) {
    u.send(
      "Usage: +harvest/reap <target>  (touch; breaking point)",
    );
    return;
  }
  const t = await u.util.target(u.me, rest, true);
  if (!t) {
    u.send(`No one matches '${rest}'.`);
    return;
  }
  if (t.id === u.me.id) {
    u.send("You cannot reap yourself.");
    return;
  }
  const vRaw = t.state?.cofd;
  const victimSheet = vRaw && typeof vRaw === "object"
    ? migrateSheet(vRaw)
    : null;
  if (!victimSheet) {
    u.send("Target has no character sheet to reap.");
    return;
  }

  const r = applyReap(sheet, victimSheet as CofdSheet);
  if (!r.ok || !r.actorSheet || !r.victimSheet) {
    u.send(r.reason ?? "Reap failed.");
    return;
  }
  await persistSheet(u, u.me.id, r.actorSheet);
  await persistSheet(u, t.id, r.victimSheet);
  const name = u.util.displayName(t, u.me);
  u.send([`You reap %cy${name}%cn.`, ...r.lines].join("\n"));
  try {
    u.send(
      "A wave of emptiness hits you (Ravaged).",
      t.id,
    );
  } catch {
    // optional notify
  }
}
