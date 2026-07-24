// +hunt — Wild Hunt loop and Huntsman powers (CtL p.262+).

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import { isChangelingSheet, isMienActive } from "../form/index.ts";
import {
  activateHuntsmanPower,
  applyTrackResult,
  endHunt,
  HUNTSMAN_POWERS,
  initHuntsmanSheet,
  isHuntsmanSheet,
  readHunterState,
  readQuarryHunt,
  startHunt,
  trackPoolBonus,
  writeHunterState,
} from "../huntsman/index.ts";
import {
  executeRoll,
  parseRollExpression,
} from "../roller/index.ts";
import {
  getSheet,
  isStaff,
  persistSheet,
} from "./hedge_helpers.ts";

export async function huntCommand(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (!sw || sw === "status") return await huntStatus(u, rest);
  if (sw === "powers" || sw === "list") {
    return await huntPowersList(u);
  }
  if (sw === "power" || sw === "use") {
    return await huntPower(u, rest);
  }
  if (sw === "track") return await huntTrack(u, rest);
  if (sw === "read") return await huntRead(u, rest);
  if (sw === "mark" || sw === "start") {
    return await huntMark(u, rest);
  }
  if (sw === "end") return await huntEnd(u, rest);
  if (sw === "create") return await huntCreate(u, rest);
  if (sw === "grant") return await huntGrant(u, rest);

  u.send(`Unknown +hunt switch: /${sw}. Try +hunt`);
}

async function huntStatus(
  u: IUrsamuSDK,
  who: string,
): Promise<void> {
  let target = u.me;
  if (who && isStaff(u.me)) {
    const t = await u.util.target(u.me, who, true);
    if (!t) {
      u.send(`No player matches '${who}'.`);
      return;
    }
    target = t;
  }
  const sheet = getSheet(target);
  if (!sheet) {
    u.send("No character sheet.");
    return;
  }
  const lines = [await divider("W I L D  H U N T")];

  if (isHuntsmanSheet(sheet)) {
    const hs = readHunterState(sheet);
    lines.push(
      `  Huntsman %cy${hs?.title ?? "Verderer"}%cn  ` +
        `Wyrd ${sheet.powerStatValue}`,
    );
    lines.push(
      `  Aspiration: ${(hs?.aspiration ?? "—").slice(0, 50)}`,
    );
    lines.push(
      `  Quarry: ${hs?.quarryName ?? "(none)"}  ` +
        `stage ${hs?.stage ?? "—"}  ` +
        `${hs?.progress ?? 0}/10`,
    );
    lines.push(
      `  Panoply: ${(hs?.panoply ?? []).join(", ") || "—"}`,
    );
    lines.push(
      `  Powers: ${(hs?.powers ?? []).join(", ") || "—"}`,
    );
    lines.push("  +hunt/track <quarry>  +hunt/power <name>");
  } else {
    const qh = readQuarryHunt(sheet);
    if (qh?.active) {
      lines.push(
        `  %crHUNTED%cn by ${qh.hunterName}  ` +
          `stage %cy${qh.stage}%cn  ${qh.progress}/10`,
      );
      lines.push(
        "  Dropping Mask feeds the hunt " +
          "(+quarry Wyrd to track).",
      );
    } else {
      lines.push("  No active hunt on this sheet.");
    }
    if (isChangelingSheet(sheet)) {
      lines.push("  Staff: +hunt/mark <you>=<huntsman>");
    }
  }
  u.send(lines.join("\n"));
}

async function huntPowersList(u: IUrsamuSDK): Promise<void> {
  const lines = [
    await divider("H U N T S M A N  P O W E R S"),
  ];
  for (const p of HUNTSMAN_POWERS) {
    lines.push(
      `  %cy${p.slug}%cn  ${p.glamour}G` +
        (p.willpower ? ` ${p.willpower}WP` : ""),
    );
    lines.push(`    ${p.name}: ${p.description.slice(0, 56)}`);
  }
  lines.push("  +hunt/power <slug> [note]");
  u.send(lines.join("\n"));
}

async function huntPower(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isHuntsmanSheet(sheet)) {
    u.send("Only Huntsman sheets use +hunt/power.");
    return;
  }
  const sp = rest.indexOf(" ");
  const key = (sp >= 0 ? rest.slice(0, sp) : rest).trim();
  const note = sp >= 0 ? rest.slice(sp + 1).trim() : "";
  if (!key) {
    u.send("Usage: +hunt/power <slug> [note]");
    return;
  }
  const r = activateHuntsmanPower(sheet, key, note || undefined);
  if (!r.ok || !r.sheet) {
    u.send(r.reason ?? "Power failed.");
    return;
  }
  await persistSheet(u, u.me.id, r.sheet);
  u.send(r.lines.join("\n"));
  if (r.kindred) {
    const hs = readHunterState(r.sheet);
    if (hs?.quarryId) {
      const rows = await u.db.search({ id: hs.quarryId });
      const q = rows[0];
      const qs = q ? getSheet(q as { state?: Record<string, unknown> }) : null;
      if (qs) {
        u.send(
          [
            "  Kindred Spirits readout:",
            `    Needle: ${qs.customFields?.needle ?? "—"}`,
            `    Thread: ${qs.customFields?.thread ?? "—"}`,
            `    Clarity: ${qs.moralityValue}`,
            `    Aspirations: ` +
              `${(qs.aspirations ?? []).map((a) =>
                typeof a === "object" && a && "text" in a
                  ? String((a as { text: string }).text)
                  : String(a)
              ).join("; ") || "—"}`,
          ].join("\n"),
        );
      }
    }
  }
}

async function huntTrack(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet = getSheet(u.me);
  if (!sheet || !isHuntsmanSheet(sheet)) {
    u.send("Only Huntsmen track with +hunt/track.");
    return;
  }
  if (!rest) {
    u.send("Usage: +hunt/track <quarry name>");
    return;
  }
  const t = await u.util.target(u.me, rest, true);
  if (!t) {
    u.send(`No one matches '${rest}'.`);
    return;
  }
  const qSheet = getSheet(t);
  if (!qSheet || !isChangelingSheet(qSheet)) {
    u.send("Quarry must be a changeling.");
    return;
  }
  const maskDown = isMienActive(qSheet);
  const bonus = trackPoolBonus(
    sheet.powerStatValue || 0,
    qSheet.powerStatValue || 0,
    maskDown,
  );
  const expr = "Wits+Survival+Wyrd";
  const parsed = parseRollExpression(expr, sheet);
  let pool = parsed.error
    ? (sheet.attributes?.wits ?? 1) +
      (sheet.skills?.survival ?? 0) +
      (sheet.powerStatValue || 0)
    : parsed.pool;
  pool += bonus;
  // Hedge nav ease: +1 (book: reduce target; we add die)
  if (qSheet.hedgeState?.inHedge) pool += 1;
  const roll = executeRoll(pool);
  const lines = [
    `TRACK ${expr}` +
      (bonus ? ` +Mask(${bonus})` : "") +
      ` ${pool}d → ${roll.successes}` +
      (maskDown ? " [mien exposed]" : ""),
  ];
  const r = applyTrackResult(qSheet, sheet, roll.successes, {
    maskDown,
  });
  if (!r.ok || !r.quarry || !r.hunter) {
    u.send([...lines, r.reason ?? "Track failed."].join("\n"));
    return;
  }
  await persistSheet(u, t.id, r.quarry);
  await persistSheet(u, u.me.id, r.hunter);
  u.send([...lines, ...r.lines].join("\n"));
  try {
    u.send(
      `The hunt tightens (${r.quarry.huntState?.stage} ` +
        `${r.quarry.huntState?.progress}/10).`,
      t.id,
    );
  } catch {
    // optional
  }
}

async function huntRead(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  // Alias kindred spirits without cost if already paid — or free ST
  const sheet = getSheet(u.me);
  if (!sheet || !isHuntsmanSheet(sheet)) {
    u.send("Huntsman only.");
    return;
  }
  const hs = readHunterState(sheet);
  const name = rest || hs?.quarryName || "";
  if (!name && !hs?.quarryId) {
    u.send("Usage: +hunt/read <quarry> (or mark a quarry first)");
    return;
  }
  let t = null;
  if (hs?.quarryId) {
    const rows = await u.db.search({ id: hs.quarryId });
    t = rows[0] ?? null;
  }
  if (!t && name) {
    t = await u.util.target(u.me, name, true);
  }
  if (!t) {
    u.send("Quarry not found.");
    return;
  }
  // costs 1G via kindred if not staff free read
  if (!isStaff(u.me)) {
    const r = activateHuntsmanPower(sheet, "kindred-spirits");
    if (!r.ok || !r.sheet) {
      u.send(r.reason ?? "Need Kindred Spirits.");
      return;
    }
    await persistSheet(u, u.me.id, r.sheet);
  }
  const qs = getSheet(t as { state?: Record<string, unknown> });
  if (!qs) {
    u.send("No quarry sheet.");
    return;
  }
  const tObj = t as Parameters<typeof u.util.displayName>[0];
  u.send(
    [
      await divider("KINDRED SPIRITS"),
      `  ${u.util.displayName(tObj, u.me)}`,
      `  Needle: ${qs.customFields?.needle ?? "—"}`,
      `  Thread: ${qs.customFields?.thread ?? "—"}`,
      `  Clarity: ${qs.moralityValue} / Wyrd ${qs.powerStatValue}`,
      `  Court: ${qs.customFields?.court ?? "—"}`,
    ].join("\n"),
  );
}

async function huntMark(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff: +hunt/mark <changeling>=<huntsman>");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +hunt/mark <changeling>=<huntsman player>");
    return;
  }
  const a = await u.util.target(u.me, rest.slice(0, eq).trim(), true);
  const b = await u.util.target(u.me, rest.slice(eq + 1).trim(), true);
  if (!a || !b) {
    u.send("Both names must match.");
    return;
  }
  const qS = getSheet(a);
  let hS = getSheet(b);
  if (!qS || !isChangelingSheet(qS)) {
    u.send("Left must be changeling.");
    return;
  }
  if (!hS) {
    u.send("Huntsman needs a sheet.");
    return;
  }
  if (!isHuntsmanSheet(hS)) {
    hS = initHuntsmanSheet(hS);
  }
  const pair = startHunt(qS, hS, {
    hunterId: b.id,
    hunterName: u.util.displayName(b, u.me),
    quarryId: a.id,
    quarryName: u.util.displayName(a, u.me),
  });
  await persistSheet(u, a.id, pair.quarry);
  await persistSheet(u, b.id, pair.hunter);
  u.send(
    `Hunt begun: ${u.util.displayName(b, u.me)} stalks ` +
      `${u.util.displayName(a, u.me)}.`,
  );
}

async function huntEnd(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me) && !isHuntsmanSheet(getSheet(u.me)!)) {
    u.send("Staff or Huntsman: +hunt/end <quarry>");
    return;
  }
  const name = rest || "";
  let quarry = u.me;
  let hunterObj = u.me;
  if (name) {
    const t = await u.util.target(u.me, name, true);
    if (!t) {
      u.send("Not found.");
      return;
    }
    const ts = getSheet(t);
    if (ts && isChangelingSheet(ts) && readQuarryHunt(ts)) {
      quarry = t;
    } else if (ts && isHuntsmanSheet(ts)) {
      hunterObj = t;
      const hs = readHunterState(ts);
      if (hs?.quarryId) {
        const rows = await u.db.search({ id: hs.quarryId });
        if (rows[0]) quarry = rows[0] as typeof u.me;
      }
    }
  }
  const qS = getSheet(quarry);
  const hS = getSheet(hunterObj);
  if (!qS) {
    u.send("No quarry sheet.");
    return;
  }
  const r = endHunt(qS, hS);
  await persistSheet(u, quarry.id, r.quarry);
  if (r.hunter && hunterObj) {
    await persistSheet(u, hunterObj.id, r.hunter);
  }
  u.send("Hunt ended.");
}

async function huntCreate(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff: +hunt/create <player> [=title]");
    return;
  }
  const eq = rest.indexOf("=");
  const who = (eq >= 0 ? rest.slice(0, eq) : rest).trim();
  const title = eq >= 0 ? rest.slice(eq + 1).trim() : "";
  if (!who) {
    u.send("Usage: +hunt/create <player> [=title]");
    return;
  }
  const t = await u.util.target(u.me, who, true);
  if (!t) {
    u.send("Not found.");
    return;
  }
  const sheet = getSheet(t) ?? undefined;
  if (!sheet) {
    u.send("Target needs a character sheet first.");
    return;
  }
  const next = initHuntsmanSheet(sheet, {
    title: title || "The Verderer",
  });
  await persistSheet(u, t.id, next);
  u.send(
    `${u.util.displayName(t, u.me)} is now a Huntsman ` +
      `(%cy${next.hunterState?.title}%cn).`,
  );
}

async function huntGrant(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Staff: +hunt/grant <player>=<power slug>");
    return;
  }
  const eq = rest.indexOf("=");
  if (eq < 0) {
    u.send("Usage: +hunt/grant <player>=<power>");
    return;
  }
  const t = await u.util.target(u.me, rest.slice(0, eq).trim(), true);
  if (!t) {
    u.send("Not found.");
    return;
  }
  const slug = rest.slice(eq + 1).trim().toLowerCase();
  const sheet = getSheet(t);
  if (!sheet || !isHuntsmanSheet(sheet)) {
    u.send("Target must be a Huntsman sheet.");
    return;
  }
  const hs = readHunterState(sheet) ?? { powers: [], panoply: [] };
  if (hs.powers.includes(slug)) {
    u.send("Already has that power.");
    return;
  }
  const next = writeHunterState(sheet, {
    ...hs,
    powers: [...hs.powers, slug],
  });
  await persistSheet(u, t.id, next);
  u.send(`Granted %cy${slug}%cn.`);
}
