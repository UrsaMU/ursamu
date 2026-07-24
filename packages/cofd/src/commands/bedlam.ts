// +bedlam — Incite Bedlam (CtL p.110).

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  isChangelingSheet,
  pandemoniacalBonus,
} from "../form/index.ts";
import { spendGlamour } from "../hedge/portal.ts";
import {
  executeRoll,
  parseRollExpression,
} from "../roller/index.ts";
import { addCondition } from "../subsystems/conditions.ts";
import {
  getSheet,
  persistSheet,
} from "./hedge_helpers.ts";
import { migrateSheet, type CofdSheet } from "../stats/index.ts";

/** Court emotion → Condition key. */
const EMOTION_COND: Record<string, string> = {
  desire: "wanton",
  wanton: "wanton",
  spring: "wanton",
  wrath: "competitive",
  competitive: "competitive",
  summer: "competitive",
  fear: "frightened",
  frightened: "frightened",
  autumn: "frightened",
  sorrow: "lethargic",
  lethargic: "lethargic",
  winter: "lethargic",
};

/**
 * +bedlam <emotion> [extra glamour 0-5]
 * Cost 1G+1WP. Pool Man+Wyrd (+Pandemoniacal).
 */
export async function bedlamExec(u: IUrsamuSDK): Promise<void> {
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim() ||
    u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings Incite Bedlam.");
    return;
  }
  if (!rest) {
    u.send(
      "Usage: +bedlam <desire|wrath|fear|sorrow> [+G]",
    );
    u.send(
      "  Cost 1 Glamour + 1 Willpower. Room-wide contest.",
    );
    return;
  }
  const parts = rest.split(/\s+/);
  const emoKey = parts[0].toLowerCase();
  const cond = EMOTION_COND[emoKey];
  if (!cond) {
    u.send(
      "Emotion must be desire/wrath/fear/sorrow " +
        "(or court / Condition name).",
    );
    return;
  }
  let extraG = 0;
  if (parts[1]) {
    const n = parseInt(parts[1].replace(/^\+/, ""), 10);
    if (!isNaN(n)) extraG = Math.max(0, Math.min(5, n));
  }
  const gCost = 1 + extraG;
  if ((sheet.energyCurrent ?? 0) < gCost) {
    u.send(
      `Need ${gCost} Glamour (have ${sheet.energyCurrent}).`,
    );
    return;
  }
  if ((sheet.advantages?.willpowerCurrent ?? 0) < 1) {
    u.send("Need 1 Willpower.");
    return;
  }

  let next = spendGlamour(sheet, gCost);
  next = {
    ...next,
    advantages: {
      ...next.advantages,
      willpowerCurrent:
        (next.advantages?.willpowerCurrent ?? 0) - 1,
    },
  };

  const pan = pandemoniacalBonus(next);
  const expr = "Manipulation+Wyrd";
  const parsed = parseRollExpression(expr, next);
  let pool = parsed.error
    ? (next.attributes?.manipulation ?? 1) +
      (next.powerStatValue || 0)
    : parsed.pool;
  pool += pan + extraG;
  const aRoll = executeRoll(pool);
  const lines = [
    `You Incite Bedlam (%cy${cond}%cn).`,
    `  Cost: Glamour -${gCost}, WP -1` +
      (pan ? `  Pandemoniacal +${pan}` : "") +
      (extraG ? `  extra G +${extraG} dice` : ""),
    `  ROLL Man+Wyrd ${pool}d → ${aRoll.successes} ` +
      `success${aRoll.successes === 1 ? "" : "es"}` +
      (aRoll.exceptional ? " (exceptional)" : ""),
  ];

  if (aRoll.dramaticFailure) {
    lines.push(
      "  Dramatic failure: the crowd turns on you (ST).",
    );
    await persistSheet(u, u.me.id, next);
    u.send(lines.join("\n"));
    return;
  }
  if (aRoll.successes < 1) {
    lines.push("  Failure: no emotional wave takes hold.");
    await persistSheet(u, u.me.id, next);
    u.send(lines.join("\n"));
    return;
  }

  const roomId = u.here?.id ?? "";
  const occupants = roomId
    ? await u.db.search({ location: roomId })
    : [];
  let hit = 0;
  for (const raw of occupants as IDBObj[]) {
    if (!raw?.id || raw.id === u.me.id) continue;
    if (!(raw.flags as Set<string>)?.has("player")) continue;
    const vs =
      raw.state?.cofd && typeof raw.state.cofd === "object"
        ? migrateSheet(raw.state.cofd)
        : null;
    if (!vs) continue;
    const dPool = Math.max(
      0,
      (vs.attributes?.composure ?? 1) +
        (vs.powerStatValue || 0),
    );
    const dRoll = executeRoll(dPool);
    if (dRoll.successes >= aRoll.successes) {
      lines.push(
        `  ${u.util.displayName(raw, u.me)} resists ` +
          `(${dRoll.successes} vs ${aRoll.successes}).`,
      );
      continue;
    }
    let vNext = addCondition(vs as CofdSheet, cond);
    if (aRoll.exceptional) {
      vNext = addCondition(vNext, "spooked");
    }
    await persistSheet(u, raw.id, vNext);
    hit++;
    lines.push(
      `  ${u.util.displayName(raw, u.me)} gains ` +
        `%cy${cond}%cn` +
        (aRoll.exceptional ? " + spooked" : "") + ".",
    );
    try {
      u.send(
        `Bedlam washes over you — Condition: ${cond}.`,
        raw.id,
      );
    } catch {
      // ignore
    }
  }
  if (hit === 0) {
    lines.push(
      "  No sheeted PCs failed (NPCs/ST still affected).",
    );
  }
  await persistSheet(u, u.me.id, next);
  u.send(lines.join("\n"));
  u.here?.broadcast?.(
    `${u.util.displayName(u.me, u.me)} unleashes Bedlam!`,
  );
}
