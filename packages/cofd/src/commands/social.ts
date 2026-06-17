// +social command -- CoFD 2e Social Maneuvering (Core p.81-83).
//
// Tracks a persistent social encounter between an initiator (always u.me)
// and a subject (any PC/NPC found via u.util.target). The maneuver lives
// in cofd.social-maneuvers as a DBO record. Reads of sheet data come from
// the SDK surface (u.me.state.cofd / target.state.cofd); writes target
// "data.cofd" -- writing to "state.cofd" silently drops the data.

import { divider, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  abandonManeuver,
  applyHardLeverage,
  applySoftLeverage,
  attemptDoor,
  buildManeuver,
  findActive,
  forceDoors,
  listActive,
  maneuverDb,
  setImpression,
} from "../social/maneuver.ts";
import {
  IMPRESSION_INTERVAL,
  IMPRESSION_ORDER,
  type Impression,
  type SocialManeuver,
} from "../social/types.ts";
import type { CofdSheet } from "../stats/index.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitForTarget(rest: string): { body: string; target: string } {
  const idx = rest.toLowerCase().lastIndexOf(" for ");
  if (idx < 0) return { body: rest.trim(), target: "" };
  return { body: rest.slice(0, idx).trim(), target: rest.slice(idx + 5).trim() };
}

function splitEquals(s: string): { lhs: string; rhs: string } {
  const idx = s.indexOf("=");
  if (idx < 0) return { lhs: s.trim(), rhs: "" };
  return { lhs: s.slice(0, idx).trim(), rhs: s.slice(idx + 1).trim() };
}

function isImpression(s: string): s is Impression {
  return (IMPRESSION_ORDER as string[]).includes(s);
}

function sheetOf(obj: IDBObj | null | undefined): CofdSheet | null {
  if (!obj) return null;
  const s = (obj.state?.cofd as CofdSheet | undefined) ?? null;
  return s;
}

function renderPanel(m: SocialManeuver): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("S O C I A L  M A N E U V E R");
  lines.push("-".repeat(78));
  lines.push(`  Initiator: ${m.initiatorName}`);
  lines.push(`  Subject:   ${m.subjectName}`);
  lines.push(`  Goal:      ${m.goal || "(unspecified)"}`);
  lines.push("");
  const remaining = m.doorsTotal - m.doorsOpen;
  lines.push(
    `  Doors:      ${m.doorsOpen} open / ${m.doorsTotal} total ` +
      `(${remaining} remaining)`,
  );
  lines.push(
    `  Impression: ${m.impression}  (interval: ${IMPRESSION_INTERVAL[m.impression]})`,
  );
  lines.push(`  Penalty:    -${m.penalty} to next door roll`);
  if (m.forced) lines.push(`  Flagged:    forced`);
  if (m.immune) lines.push(`  Status:     SUBJECT IMMUNE`);
  if (m.resolved && !m.immune) {
    lines.push(`  Status:     RESOLVED (${m.endReason ?? "resolved"})`);
  }
  if (m.leverage.length > 0) {
    lines.push("");
    lines.push("  Leverage History:");
    for (const e of m.leverage) {
      const tag = e.kind === "hard" ? "HARD" : "soft";
      const dr = e.doorsRemoved > 0 ? ` (-${e.doorsRemoved} door)` : "";
      lines.push(`    [${tag}] ${e.flavor}: ${e.text}${dr}`);
    }
  }
  return lines.join("\n");
}

async function loadManeuver(
  u: IUrsamuSDK,
  targetName: string,
): Promise<{ m: SocialManeuver; subject: IDBObj } | null> {
  if (!targetName) {
    const list = await listActive(u.me.id);
    if (list.length === 0) {
      u.send("You have no active social maneuvers. See +social/start.");
      return null;
    }
    if (list.length > 1) {
      u.send(
        "You have multiple active maneuvers. Specify a subject: '... for <player>'.",
      );
      return null;
    }
    const m = list[0];
    const subject = await u.util.target(u.me, m.subjectName, true);
    if (!subject) {
      u.send(`Subject '${m.subjectName}' no longer reachable.`);
      return null;
    }
    return { m, subject };
  }
  const subject = await u.util.target(u.me, targetName, true);
  if (!subject) {
    u.send(`Subject '${targetName}' not found.`);
    return null;
  }
  const m = await findActive(u.me.id, subject.id);
  if (!m) {
    u.send(`No active maneuver against ${subject.name}. Use +social/start.`);
    return null;
  }
  return { m, subject };
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------

async function socialStart(u: IUrsamuSDK, rest: string) {
  const { lhs, rhs } = splitEquals(rest);
  if (!lhs || !rhs) {
    u.send("Usage: +social/start <target>=<goal>");
    return;
  }
  const subject = await u.util.target(u.me, lhs, true);
  if (!subject) {
    u.send(`Subject '${lhs}' not found.`);
    return;
  }
  if (subject.id === u.me.id) {
    u.send("You cannot run a social maneuver against yourself.");
    return;
  }
  const existing = await findActive(u.me.id, subject.id);
  if (existing) {
    u.send(`You already have an active maneuver against ${subject.name}.`);
    u.send(renderPanel(existing));
    return;
  }
  const subjSheet = sheetOf(subject);
  if (!subjSheet) {
    u.send("That subject does not have an approved character sheet yet.");
    return;
  }
  const resolve = Math.max(1, subjSheet.attributes.resolve ?? 1);
  const composure = Math.max(1, subjSheet.attributes.composure ?? 1);
  const m = buildManeuver({
    initiatorId: u.me.id,
    initiatorName: u.me.name ?? u.me.id,
    subjectId: subject.id,
    subjectName: subject.name ?? subject.id,
    goal: rhs.slice(0, 200),
    subjectResolve: resolve,
    subjectComposure: composure,
  });
  await maneuverDb.create(m);
  u.send(
    `Opened social maneuver against ${subject.name}: ${m.doorsTotal} ` +
      `door(s) (Resolve ${resolve}, Composure ${composure}).`,
  );
  u.send(renderPanel(m));
}

// ---------------------------------------------------------------------------
// /impression
// ---------------------------------------------------------------------------

async function socialImpression(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const level = body.toLowerCase().trim();
  if (!level || !isImpression(level)) {
    u.send(
      "Usage: +social/impression <hostile|average|good|excellent|perfect> [for <target>]",
    );
    return;
  }
  const loaded = await loadManeuver(u, targetName);
  if (!loaded) return;
  const { m, subject } = loaded;
  // Setting impression on a subject you do not own (or that is not yourself
  // initiating) is an ST override: require canEdit on the subject.
  if (!(await u.canEdit(u.me, subject))) {
    u.send("Permission denied. ST/builder+ override required to set impression.");
    return;
  }
  const updated = setImpression(m, level);
  await maneuverDb.update({ id: m.id } as Q, updated);
  u.send(`Impression on ${subject.name} set to '${level}'.`);
  u.send(renderPanel(updated));
}

// ---------------------------------------------------------------------------
// /door
// ---------------------------------------------------------------------------

async function socialDoor(u: IUrsamuSDK, rest: string) {
  const { body, target: targetName } = splitForTarget(rest);
  const reason = body.slice(0, 200);
  const loaded = await loadManeuver(u, targetName);
  if (!loaded) return;
  const { m, subject } = loaded;

  if (m.impression === "hostile") {
    u.send(
      "Subject is HOSTILE -- no roll possible until impression improves " +
        "(see +social/impression or apply soft leverage).",
    );
    return;
  }

  const mySheet = sheetOf(u.me);
  const subjSheet = sheetOf(subject);
  if (!mySheet || !subjSheet) {
    u.send("Both initiator and subject must have an approved sheet.");
    return;
  }
  const pool = (mySheet.attributes.manipulation ?? 1) +
    (mySheet.skills.persuasion ?? 0);
  const resistance = subjSheet.attributes.composure ?? 1;

  const result = attemptDoor(m, { pool, resistance });
  await maneuverDb.update({ id: m.id } as Q, result.maneuver);

  const tagged = reason ? ` (${reason})` : "";
  const atk = result.attacker;
  const def = result.defender;
  const line =
    `SOCIAL>> ${m.initiatorName} attempts a Door vs ${m.subjectName}${tagged}: ` +
    `${atk.successes} vs ${def.successes}`;
  u.send(line);

  if (result.outcome === "dramatic-fail") {
    u.send(
      `%cr*** Dramatic Failure. ${m.subjectName} is immune to your further ` +
        `social efforts until next story.%cn`,
    );
    return;
  }
  if (result.outcome === "failed") {
    u.send(
      `Failed. Cumulative penalty now -${result.maneuver.penalty} on future door rolls.`,
    );
    return;
  }
  if (result.outcome === "resolved") {
    await broadcastResolution(u, result.maneuver);
    return;
  }
  // opened
  const doorsOpen = result.maneuver.doorsOpen;
  const total = result.maneuver.doorsTotal;
  u.send(
    `Door opens (${result.doorsOpened > 1 ? "exceptional: 2 doors" : "1 door"}). ` +
      `${doorsOpen}/${total} now open.`,
  );
}

// ---------------------------------------------------------------------------
// /soft and /hard leverage
// ---------------------------------------------------------------------------

async function socialSoft(u: IUrsamuSDK, rest: string) {
  // Form: <flavor>=<text> [for <target>]
  const { body, target: targetName } = splitForTarget(rest);
  const { lhs, rhs } = splitEquals(body);
  if (!lhs || !rhs) {
    u.send(
      "Usage: +social/soft <aspiration|vice|gift>=<text> [for <target>]",
    );
    return;
  }
  const loaded = await loadManeuver(u, targetName);
  if (!loaded) return;
  const { m, subject } = loaded;
  const result = applySoftLeverage(m, lhs, rhs.slice(0, 200));
  await maneuverDb.update({ id: m.id } as Q, result.maneuver);
  if (result.effect === "door-removed") {
    u.send(
      `Soft leverage applied (${lhs}): one door removed without a roll. ` +
        `${result.maneuver.doorsOpen}/${result.maneuver.doorsTotal} doors open.`,
    );
  } else if (result.effect === "impression-up") {
    u.send(
      `Soft leverage applied (${lhs}): impression on ${subject.name} ` +
        `improves to '${result.maneuver.impression}'.`,
    );
  } else {
    u.send("Leverage had no effect.");
  }
  if (result.maneuver.resolved) {
    await broadcastResolution(u, result.maneuver);
  }
}

async function socialHard(u: IUrsamuSDK, rest: string) {
  // Form: [severe] <text> [for <target>]
  const { body, target: targetName } = splitForTarget(rest);
  const trimmed = body.trim();
  if (!trimmed) {
    u.send("Usage: +social/hard [severe] <text> [for <target>]");
    return;
  }
  const severe = /^severe\b/i.test(trimmed);
  const text = severe ? trimmed.replace(/^severe\s*/i, "").trim() : trimmed;
  const loaded = await loadManeuver(u, targetName);
  if (!loaded) return;
  const { m, subject } = loaded;
  const result = applyHardLeverage(m, text.slice(0, 200), severe);
  await maneuverDb.update({ id: m.id } as Q, result.maneuver);
  u.send(
    `Hard leverage applied against ${subject.name}: ${result.doorsRemoved} ` +
      `door(s) forced. Impression worsens to '${result.maneuver.impression}'.`,
  );
  u.send(
    "WARNING: hard leverage burns bridges and may trigger a breaking point " +
      "for your character. See p.83.",
  );
  if (result.maneuver.resolved) {
    await broadcastResolution(u, result.maneuver);
  }
}

// ---------------------------------------------------------------------------
// /force
// ---------------------------------------------------------------------------

async function socialForce(u: IUrsamuSDK, rest: string) {
  const { target: targetName } = splitForTarget(rest);
  const loaded = await loadManeuver(u, targetName);
  if (!loaded) return;
  const { m, subject } = loaded;
  const mySheet = sheetOf(u.me);
  const subjSheet = sheetOf(subject);
  if (!mySheet || !subjSheet) {
    u.send("Both initiator and subject must have an approved sheet.");
    return;
  }
  const pool = (mySheet.attributes.manipulation ?? 1) +
    (mySheet.skills.persuasion ?? 0);
  const resistance = subjSheet.attributes.composure ?? 1;
  const result = forceDoors(m, { pool, resistance });
  await maneuverDb.update({ id: m.id } as Q, result.maneuver);
  if (result.outcome === "resolved") {
    u.send(
      `Forced. ${result.attacker.successes} vs ${result.defender.successes}: ` +
        `all doors blown.`,
    );
    await broadcastResolution(u, result.maneuver);
    return;
  }
  if (result.outcome === "failed") {
    u.send(
      `Force attempt FAILED (${result.attacker.successes} vs ` +
        `${result.defender.successes}). ${subject.name} is now immune to ` +
        `further social maneuvers from you.`,
    );
    return;
  }
  u.send("Maneuver already closed.");
}

// ---------------------------------------------------------------------------
// /status, /list, /end
// ---------------------------------------------------------------------------

async function socialStatus(u: IUrsamuSDK, rest: string) {
  const { target: targetName } = splitForTarget(rest.trim() ? `for ${rest.trim()}` : "");
  const loaded = await loadManeuver(u, targetName);
  if (!loaded) return;
  u.send(renderPanel(loaded.m));
}

async function socialList(u: IUrsamuSDK) {
  const list = await listActive(u.me.id);
  const lines: string[] = [];
  lines.push(await divider("S O C I A L"));
  if (list.length === 0) {
    lines.push("  No active social maneuvers.");
  } else {
    for (const m of list) {
      const remaining = m.doorsTotal - m.doorsOpen;
      lines.push(
        `  ${m.subjectName.padEnd(20)} ${m.doorsOpen}/${m.doorsTotal} ` +
          `(${remaining} left)  [${m.impression}]  -1x${m.penalty}  ` +
          `goal: ${m.goal.slice(0, 28)}`,
      );
    }
  }
  u.send(lines.join("\n"));
}

async function socialEnd(u: IUrsamuSDK, rest: string) {
  const { target: targetName } = splitForTarget(rest.trim() ? `for ${rest.trim()}` : "");
  const loaded = await loadManeuver(u, targetName);
  if (!loaded) return;
  const updated = abandonManeuver(loaded.m);
  await maneuverDb.update({ id: loaded.m.id } as Q, updated);
  u.send(
    `Maneuver against ${loaded.subject.name} abandoned. Any opened doors close.`,
  );
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

async function broadcastResolution(u: IUrsamuSDK, m: SocialManeuver) {
  const banner: string[] = [];
  banner.push(await divider("R E S O L V E D"));
  banner.push("");
  banner.push(`  ${m.subjectName} capitulates to ${m.initiatorName}.`);
  banner.push(`  Goal: ${m.goal}`);
  if (m.forced) {
    banner.push("  (Forced -- subject acts under duress.)");
  } else {
    banner.push("  All doors open. Subject must act per the stated goal,");
    banner.push("  or (if PC) the subject's player may offer an alternative");
    banner.push("  and impose a Condition in exchange (CoFD 2e p.82).");
  }
  banner.push("");
  u.send(banner.join("\n"));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function socialExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  switch (sw) {
    case "":
    case "status":
      if (rest) {
        await socialStatus(u, rest);
      } else {
        await socialList(u);
      }
      return;
    case "list":
      await socialList(u);
      return;
    case "start":
      await socialStart(u, rest);
      return;
    case "impression":
      await socialImpression(u, rest);
      return;
    case "door":
      await socialDoor(u, rest);
      return;
    case "soft":
      await socialSoft(u, rest);
      return;
    case "hard":
      await socialHard(u, rest);
      return;
    case "force":
      await socialForce(u, rest);
      return;
    case "end":
    case "abandon":
      await socialEnd(u, rest);
      return;
    default:
      u.send(`Unknown +social switch: /${sw}. See help +social.`);
  }
}
