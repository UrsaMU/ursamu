// +spin — Hedgespinning (reshape the Hedge, CtL).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  createFruitObject,
  isInHedge,
  parseHedgeRoom,
} from "../hedge/index.ts";
import {
  findSpinEffect,
  listSpinEffects,
  resolveSpin,
} from "../spin/index.ts";
import {
  executeRoll,
  parseRollExpression,
} from "../roller/index.ts";
import {
  getSheet,
  persistRoomHedge,
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";
import { isChangelingSheet } from "../form/mask.ts";
import {
  effectiveAttr,
  effectiveSkill,
} from "../stats/effective.ts";

export async function spinCommand(
  u: IUrsamuSDK,
): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw || sw === "list" || sw === "effects") {
    if (!sw && rest && findSpinEffect(rest.split(/\s+/)[0])) {
      const bits = rest.split(/\s+/);
      return await spinAttempt(
        u,
        bits[0],
        bits.slice(1).join(" "),
      );
    }
    return await spinList(u);
  }
  if (sw === "info") return await spinInfo(u, rest);
  if (findSpinEffect(sw)) {
    return await spinAttempt(u, sw, rest);
  }
  u.send(`Unknown +spin switch: /${sw}. Try +spin/list`);
}

async function spinList(u: IUrsamuSDK): Promise<void> {
  const lines = [
    await divider("H E D G E S P I N N I N G"),
    "  Reshape the Hedge (must be in Hedge/Hollow).",
    "  Pool: Wits + Crafts|Occult + Wyrd.",
  ];
  for (const e of listSpinEffects()) {
    const tag = e.kind === "paradigm" ? "%crP%cn" : "S";
    lines.push(
      `  ${tag} %cy${e.slug}%cn  ${e.name}  ` +
        `${e.glamour}G  need ${e.target}`,
    );
    lines.push(`    ${e.description.slice(0, 68)}`);
  }
  lines.push("  S=subtle  P=paradigm (Hedge contests)");
  lines.push("  +spin <effect> [veil/scenery text]");
  lines.push("  +spin/info <effect>");
  u.send(lines.join("\n"));
}

async function spinInfo(
  u: IUrsamuSDK,
  key: string,
): Promise<void> {
  if (!key) {
    u.send("Usage: +spin/info <effect>");
    return;
  }
  const e = findSpinEffect(key);
  if (!e) {
    u.send(`Unknown effect '${key}'.`);
    return;
  }
  u.send(
    [
      await divider(e.name.toUpperCase()),
      `  Slug: ${e.slug}  Kind: ${e.kind}`,
      `  Cost: ${e.glamour} Glamour  Target: ${e.target}`,
      `  ${e.description}`,
      `  ${e.book}`,
      e.kind === "paradigm"
        ? "  Paradigm: Hedge contests your roll."
        : "",
    ].filter(Boolean).join("\n"),
  );
}

async function spinAttempt(
  u: IUrsamuSDK,
  effectKey: string,
  extra: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  if (!isChangelingSheet(sheet)) {
    u.send("Only the Lost can hedgespin.");
    return;
  }
  const effect = findSpinEffect(effectKey);
  if (!effect) {
    u.send(
      `Unknown effect '${effectKey}'. Try +spin/list`,
    );
    return;
  }

  const roomMeta = roomHedge(u.here ?? {});
  const inHedge = isInHedge(roomMeta) ||
    (sheet.hedgeState?.inHedge === true);

  if (effect.needsHedge && !inHedge) {
    u.send(
      "Hedgespinning only works in the Hedge or a Hollow.",
    );
    return;
  }

  if ((sheet.energyCurrent ?? 0) < effect.glamour) {
    u.send(
      `Need ${effect.glamour} Glamour ` +
        `(have ${sheet.energyCurrent ?? 0}).`,
    );
    return;
  }

  const crafts = effectiveSkill(sheet, "crafts");
  const occult = effectiveSkill(sheet, "occult");
  const skillName = crafts >= occult ? "Crafts" : "Occult";
  const expr = `Wits+${skillName}+Wyrd`;
  const parsed = parseRollExpression(expr, sheet);
  let successes = 0;
  let rollLine = "";
  if (parsed.error) {
    const pool = Math.max(
      0,
      effectiveAttr(sheet, "wits") +
        Math.max(crafts, occult) +
        (sheet.powerStatValue || 0),
    );
    const roll = executeRoll(pool);
    successes = roll.successes;
    rollLine =
      `  Roll ${pool}d: ${successes} success` +
      (successes === 1 ? "" : "es");
  } else {
    const roll = executeRoll(parsed.pool);
    successes = roll.successes;
    const dice = roll.rolls.join(" ");
    rollLine =
      `  ROLL ${expr}  ${parsed.pool}d (${dice}) -> ` +
      `${successes} success` +
      (successes === 1 ? "" : "es");
  }

  const r = resolveSpin(sheet, effect.slug, {
    inHedge,
    successes,
    veilText: extra || undefined,
    danger: roomMeta?.danger ?? "hedge",
  });

  if (r.sheet) {
    await persistSheet(u, u.me.id, r.sheet);
  }

  const lines = [...r.lines];
  if (rollLine && lines.length > 0) {
    lines.splice(1, 0, rollLine);
  }

  if (r.ok && r.roomPatch && u.here?.id) {
    const cur = parseHedgeRoom(u.here.state?.hedge) ?? {
      realm: "hedge" as const,
      danger: "hedge" as const,
    };
    await persistRoomHedge(u, u.here.id, {
      ...cur,
      ...r.roomPatch,
    });
  }

  if (r.ok && r.fruitSlug) {
    await createFruitObject(u, u.me.id, r.fruitSlug);
  }

  if (lines.length === 0) {
    u.send(r.reason ?? "Hedgespinning failed.");
    return;
  }
  u.send(lines.join("\n"));
}
