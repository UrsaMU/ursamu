// +dream — Oneiromancy light (Bastions, Ivory/Horn, weave).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  dreamFormLines,
  enterHorn,
  enterIvory,
  enterOtherBastion,
  findWeave,
  parseDreamRoom,
  readDreamState,
  resolveWeave,
  roadStatusLines,
  wakeDream,
  weaveDreamerResult,
  WEAVE_EFFECTS,
} from "../dream/index.ts";
import { isChangelingSheet } from "../form/mask.ts";
import {
  executeRoll,
  parseRollExpression,
} from "../roller/index.ts";
import {
  getSheet,
  isStaff,
  loadRoom,
  persistSheet,
} from "./hedge_helpers.ts";
import {
  dreamRoadLink,
  dreamRoadTag,
  dreamTravel,
  hornRoadOpts,
} from "./dream_roads.ts";

export async function dreamCommand(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw || sw === "status" || sw === "form") {
    return await dreamStatus(u);
  }
  if (sw === "ivory" || sw === "sleep") {
    return await dreamIvory(u);
  }
  if (sw === "horn") return await dreamHorn(u);
  if (sw === "enter") return await dreamEnter(u, rest);
  if (sw === "wake" || sw === "exit") {
    return await dreamWake(u, rest);
  }
  if (sw === "weaves" || sw === "list") {
    return await dreamWeaves(u);
  }
  if (sw === "weave") return await dreamWeave(u, rest);
  if (sw === "role") return await dreamRole(u, rest);
  if (sw === "info") return await dreamInfo(u, rest);
  if (sw === "travel") return await dreamTravel(u, rest);
  if (sw === "road" && isStaff(u.me)) {
    return await dreamRoadTag(u, rest);
  }
  if (sw === "link" && isStaff(u.me)) {
    return await dreamRoadLink(u, rest, false);
  }
  if (sw === "linkboth" && isStaff(u.me)) {
    return await dreamRoadLink(u, rest, true);
  }
  if (sw === "bastion" && isStaff(u.me)) {
    return await dreamBastionStaff(u, rest);
  }

  u.send(`Unknown +dream switch: /${sw}. Try +dream`);
}

async function dreamStatus(u: IUrsamuSDK): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const d = readDreamState(sheet);
  const lines = [await divider("O N E I R O M A N C Y")];
  if (!d) {
    lines.push("  Awake (not in a dream).");
    lines.push("  +dream/ivory   Gate of Ivory (own Bastion)");
    lines.push("  +dream/horn    Gate of Horn (from Hedge)");
    lines.push("  +dream/enter <name>   Another's Bastion");
    lines.push("  +dream/travel <exit>  Dreaming Roads");
    lines.push("  +dream/weaves  Subtle + paradigm catalog");
  } else {
    lines.push("  %cyDreaming%cn");
    lines.push(...dreamFormLines(d));
    if (d.roadRoomId || d.roadPath?.length) {
      lines.push(
        `  Roads: ${(d.roadPath ?? []).join(" → ") || d.roadRoomId}`,
      );
    }
    lines.push(
      "  +dream/weave <effect>  +dream/travel  +dream/wake",
    );
    const rid = d.roadRoomId ?? u.here?.id;
    if (rid) {
      const room = await loadRoom(u, rid);
      const dr = parseDreamRoom(room?.state?.dream);
      if (dr) lines.push(...roadStatusLines(dr));
    }
  }
  u.send(lines.join("\n"));
}

async function dreamIvory(u: IUrsamuSDK): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings use the Gate of Ivory this way.");
    return;
  }
  const parsed = parseRollExpression("Resolve+Composure", sheet);
  const pool = parsed.error
    ? (sheet.attributes?.resolve ?? 1) +
      (sheet.attributes?.composure ?? 1)
    : parsed.pool;
  const roll = executeRoll(pool);
  const lines = [
    `Gate of Ivory — Resolve+Composure ${pool}d → ` +
      `${roll.successes} success` +
      (roll.successes === 1 ? "" : "es"),
  ];
  const r = enterIvory(sheet, roll.successes);
  if (r.sheet) await persistSheet(u, u.me.id, r.sheet);
  u.send([...lines, ...(r.lines.length ? r.lines : [r.reason ?? ""])]
    .filter(Boolean).join("\n"));
}

async function dreamHorn(u: IUrsamuSDK): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only the Lost seek the Gate of Horn.");
    return;
  }
  const roadOpts = hornRoadOpts(u, sheet);
  const parsed = parseRollExpression("Wits+Survival", sheet);
  const pool = parsed.error
    ? (sheet.attributes?.wits ?? 1) +
      (sheet.skills?.survival ?? 0)
    : parsed.pool;
  const roll = executeRoll(pool);
  const lines = [
    `Gate of Horn — Wits+Survival ${pool}d → ` +
      `${roll.successes}`,
  ];
  const r = enterHorn(sheet, {
    inHedge: roadOpts.inHedge,
    successes: roll.successes,
    roadRoomId: roadOpts.roadRoomId,
    roadName: roadOpts.roadName,
  });
  if (r.sheet) await persistSheet(u, u.me.id, r.sheet);
  u.send([...lines, ...(r.lines.length ? r.lines : [r.reason ?? ""])]
    .filter(Boolean).join("\n"));
}

async function dreamEnter(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings enter Bastions this way.");
    return;
  }
  if (!rest) {
    u.send("Usage: +dream/enter <dreamer name>");
    return;
  }
  const t = await u.util.target(u.me, rest, true);
  if (!t) {
    u.send(`No one matches '${rest}'.`);
    return;
  }
  const tSheet = getSheet(t);
  // Fortification: merit or dream state's bastion, default Wyrd
  const fort =
    tSheet?.merits?.["defensive dreamscaping"] ??
    tSheet?.powerStatValue ??
    1;
  const d = readDreamState(sheet);
  if (!d?.active) {
    u.send(
      "Enter a gate first (+dream/ivory or /horn), " +
        "then +dream/enter <name>.",
    );
    return;
  }
  const parsed = parseRollExpression("Resolve+Composure", sheet);
  const pool = parsed.error
    ? (sheet.attributes?.resolve ?? 1) +
      (sheet.attributes?.composure ?? 1)
    : parsed.pool;
  // Dream form: may use Power+Resistance instead
  const dreamPool = d.power + d.resistance;
  const usePool = Math.max(pool, dreamPool);
  const roll = executeRoll(usePool);
  const lines = [
    `Enter Bastion of ${u.util.displayName(t, u.me)} — ` +
      `${usePool}d → ${roll.successes} vs Fort ${fort}`,
  ];
  const r = enterOtherBastion(sheet, {
    ownerId: t.id,
    ownerName: u.util.displayName(t, u.me),
    fortification: fort,
    successes: roll.successes,
  });
  if (r.sheet) await persistSheet(u, u.me.id, r.sheet);
  u.send([...lines, ...(r.lines.length ? r.lines : [r.reason ?? ""])]
    .filter(Boolean).join("\n"));
}

async function dreamWake(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet) {
    u.send("No sheet.");
    return;
  }
  const forced = /\bforced\b/i.test(rest);
  const d = readDreamState(sheet);
  let successes = 0;
  if (d && d.fortification > 0 && !forced &&
    d.bastionOf !== "self" && d.bastionOf !== "roads") {
    const parsed = parseRollExpression("Resolve+Composure", sheet);
    const pool = parsed.error
      ? (sheet.attributes?.resolve ?? 1) +
        (sheet.attributes?.composure ?? 1)
      : parsed.pool;
    const roll = executeRoll(Math.max(pool, d.power + d.resistance));
    successes = roll.successes;
    u.send(
      `Wake contest ${roll.successes} vs Fort ${d.fortification}.`,
    );
  }
  const r = wakeDream(sheet, { successes, forced });
  if (r.sheet) await persistSheet(u, u.me.id, r.sheet);
  u.send(
    (r.lines.length ? r.lines : [r.reason ?? "Cannot wake."])
      .join("\n"),
  );
}

async function dreamWeaves(u: IUrsamuSDK): Promise<void> {
  const lines = [
    await divider("D R E A M W E A V E"),
    "  Pool: Wits+Empathy+Wyrd (in dream). S=subtle P=paradigm",
  ];
  for (const e of WEAVE_EFFECTS) {
    const kind = "kind" in e
      ? (e as { kind: string }).kind === "paradigm" ? "%crP%cn" : "S"
      : "S";
    lines.push(
      `  ${kind} %cy${e.slug}%cn  ${e.name}  ` +
        `${e.glamour}G need ${e.target}`,
    );
  }
  lines.push("  +dream/weave <slug> [text]");
  u.send(lines.join("\n"));
}

async function dreamInfo(u: IUrsamuSDK, key: string): Promise<void> {
  if (!key) {
    u.send("Usage: +dream/info <weave>");
    return;
  }
  const e = findWeave(key);
  if (!e) {
    u.send(`Unknown weave '${key}'.`);
    return;
  }
  u.send(
    [
      await divider(e.name.toUpperCase()),
      `  ${e.glamour}G  need ${e.target}  ${e.book}`,
      `  ${e.description}`,
    ].join("\n"),
  );
}

async function dreamWeave(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isChangelingSheet(sheet)) {
    u.send("Only changelings dreamweave.");
    return;
  }
  const d = readDreamState(sheet);
  if (!d) {
    u.send("Not in a dream. +dream/ivory first.");
    return;
  }
  const parts = rest.split(/\s+/);
  const key = parts[0] ?? "";
  const extra = parts.slice(1).join(" ");
  if (!key) {
    u.send("Usage: +dream/weave <effect> [text]");
    return;
  }
  if (key === "role" || findWeave(key)?.slug === "role") {
    // handled below via resolveWeave
  }
  const expr = "Wits+Empathy+Wyrd";
  const parsed = parseRollExpression(expr, sheet);
  let pool = parsed.error
    ? (sheet.attributes?.wits ?? 1) +
      (sheet.skills?.empathy ?? 0) +
      (sheet.powerStatValue || 0)
    : parsed.pool;
  // Prefer dream form Finesse+Power when higher
  pool = Math.max(pool, d.finesse + d.power);
  const roll = executeRoll(pool);
  // Load dreamer sheet when in another's Bastion
  let dreamerSheet = null;
  if (d.bastionOf && d.bastionOf !== "self" &&
    d.bastionOf !== "roads") {
    const rows = await u.db.search({ id: d.bastionOf });
    if (rows[0]) dreamerSheet = getSheet(rows[0]);
  }
  const r = resolveWeave(
    sheet,
    d,
    key,
    roll.successes,
    extra || undefined,
    dreamerSheet,
  );
  if (r.sheet) await persistSheet(u, u.me.id, r.sheet);
  const dOut = weaveDreamerResult(
    r,
    dreamerSheet,
    key,
    roll.successes,
  );
  if (dOut && d.bastionOf) {
    await persistSheet(u, d.bastionOf, dOut);
  }
  u.send(
    [
      `WEAVE ${expr} ${pool}d → ${roll.successes}`,
      ...(r.lines.length ? r.lines : [r.reason ?? "Failed."]),
    ].join("\n"),
  );
}

async function dreamRole(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!rest) {
    u.send("Usage: +dream/role <description>");
    return;
  }
  u.cmd.args[1] = `role ${rest}`;
  return await dreamWeave(u, `role ${rest}`);
}

async function dreamBastionStaff(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  // +dream/bastion <name> [=fort] — tag this room's flavor note
  const eq = rest.indexOf("=");
  const name = (eq >= 0 ? rest.slice(0, eq) : rest).trim() ||
    "Bastion";
  const fort = eq >= 0
    ? Math.max(0, parseInt(rest.slice(eq + 1), 10) || 0)
    : 2;
  if (!u.here?.id) {
    u.send("No room.");
    return;
  }
  await u.db.modify(u.here.id, "$set", {
    "data.dream": {
      bastion: true,
      name,
      fortification: fort,
      ownerId: u.me.id,
      createdAt: Date.now(),
    },
  });
  u.send(
    `Room tagged Bastion %cy${name}%cn (Fort ${fort}).`,
  );
}
