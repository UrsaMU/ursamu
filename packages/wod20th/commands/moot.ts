// commands/moot.ts -- +moot family: schedule, run, attend, and close sept moots.
//
// A moot is the canonical Garou gathering (W20 pp. 78-79). Moots happen in
// the caern-bound room of a sept and proceed through four phases:
// Opening Howl -> Inner Sky -> Cracking the Bone -> Revel. Closing the moot
// pays +0.5 temp Honor to every attendee (canon: showing up matters).
//
// Authority model:
//   - Staff (admin/wizard/superuser) can do everything.
//   - The sept's "Master of the Howl" (resolved by substring scan of
//     sept.positions values) can schedule / open / advance phase / close
//     for their own sept.
//   - Any Garou in the caern room may /attend during an active phase.

import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { divider, footer, header } from "../core/format.ts";
import { findById, findByPlayer, saveChar } from "../db/charDb.ts";
import {
  findCaernById,
  findCaernByRoom,
} from "../db/caernDb.ts";
import {
  findSeptByCaern,
  findSeptById,
  findSeptByName,
  type ISept,
} from "../db/septDb.ts";
import {
  createMoot,
  findActiveMootForCaernRoom,
  findAllOpenMoots,
  findMoot,
  findMootsForSept,
  findOpenMootForSept,
  saveMoot,
  type IMoot,
} from "../db/mootDb.ts";
import {
  isMoothActive,
  MOOT_PHASE_INFO,
  MOOT_PHASE_ORDER,
  nextPhase,
  type MoothPhase,
} from "../splats/wta/data/moots.ts";
import type { IWoDChar } from "../core/types.ts";
import type { RenownTrack } from "../core/renown.ts";

const TRACKS: RenownTrack[] = ["glory", "honor", "wisdom"];

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

/**
 * Master of the Howl resolution. Position strings are free text on the
 * sept (see commands/sept.ts /position). We scan sept.positions for any
 * value whose lowercased text includes "master of the howl"; the keys
 * are charIds. Returns true when the supplied char is one of them.
 *
 * Edge: a sept may have no Master of the Howl (positions absent) -- the
 * test boils down to "is the caller staff?" then.
 */
function isMasterOfTheHowl(sept: ISept, charId: string): boolean {
  const pos = sept.positions[charId];
  if (!pos) return false;
  return pos.toLowerCase().includes("master of the howl");
}

async function isMootAuthority(
  u: IUrsamuSDK,
  sept: ISept,
): Promise<boolean> {
  if (isStaff(u)) return true;
  const char = await findByPlayer(u.me.id);
  if (!char) return false;
  return isMasterOfTheHowl(sept, char.id);
}

function fmtPhase(p: MoothPhase): string {
  return MOOT_PHASE_INFO[p]?.name ?? p;
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return String(ms);
  }
}

async function renderInfo(moot: IMoot): Promise<string> {
  const sept = await findSeptById(moot.septId);
  const info = MOOT_PHASE_INFO[moot.phase];
  const lines: string[] = [
    header(`Moot -- ${sept?.name ?? "(missing sept)"}`),
    `  %chPhase:%cn     ${info.name}`,
    `  %chDescription:%cn ${info.description}`,
    `  %chScheduled:%cn ${fmtDate(moot.scheduledAt)}`,
  ];
  if (moot.openedAt) lines.push(`  %chOpened:%cn    ${fmtDate(moot.openedAt)}`);
  if (moot.closedAt) lines.push(`  %chClosed:%cn    ${fmtDate(moot.closedAt)}`);
  lines.push(`  %chAttendees:%cn ${moot.attendees.length}`);
  if (moot.renownAwards.length > 0) {
    lines.push(divider("Recent Awards"));
    const recent = moot.renownAwards.slice(-5);
    for (const a of recent) {
      const c = await findById(a.charId);
      const name = c?.moniker || c?.fullName || c?.deedName || a.charId;
      lines.push(`  +${a.amount} ${a.track}  ${name}  -- ${a.reason}`);
    }
  }
  if (moot.notes.length > 0) {
    lines.push(divider("Notes"));
    for (const n of moot.notes) lines.push(`  - ${n}`);
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderList(moots: IMoot[]): Promise<string> {
  const lines: string[] = [header("Open Moots")];
  if (moots.length === 0) {
    lines.push("  (No moots are currently in session.)");
  } else {
    for (const m of moots) {
      const sept = await findSeptById(m.septId);
      lines.push(
        `  %ch${(sept?.name ?? "(missing)").padEnd(28)}%cn  ` +
          `${fmtPhase(m.phase).padEnd(18)}  ${m.attendees.length} attending`,
      );
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

/** Parse "<track>:<N>" prefix off a free-form spec; returns rest as reason. */
function parseTrackSpec(spec: string): { track: RenownTrack; amount: number; reason: string } | string {
  const m = spec.match(/^(\w+)\s*:\s*(\d+)(?:\s+(.*))?$/);
  if (!m) return "Expected <track>:<N> [reason]";
  const track = m[1].toLowerCase() as RenownTrack;
  if (!TRACKS.includes(track)) return `Unknown track "${m[1]}". Use glory, honor, or wisdom.`;
  const n = parseInt(m[2], 10);
  if (!Number.isInteger(n) || n < 1) return "Amount must be a positive integer.";
  return { track, amount: n, reason: (m[3] ?? "").trim() };
}

addCmd({
  name: "+moot",
  pattern: /^\+moot(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+moot[/switch] [<args>]  — Sept moots: schedule, run, attend.

  Phases, attend, award; staff/MotH open and close.

  Full help: +help moot
  Phases:    +help moot-phases

Examples:
  +moot/attend
  +moot/phase next
  +moot/close`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // -- /list (or no switch) ------------------------------------------------
    if (!sw || sw === "list") {
      u.send(await renderList(await findAllOpenMoots()));
      return;
    }

    // -- /info ---------------------------------------------------------------
    if (sw === "info") {
      const here = u.here as { id: string } | undefined;
      if (!here?.id) { u.send("You are nowhere."); return; }
      const moot = await findActiveMootForCaernRoom(here.id);
      if (!moot) {
        u.send("No active moot in this caern room.");
        return;
      }
      u.send(await renderInfo(moot));
      return;
    }

    // -- /schedule <sept>=<when>  (staff or MotH of that sept) ---------------
    if (sw === "schedule") {
      const eqIdx = arg.indexOf("=");
      if (eqIdx < 0) {
        u.send("Usage: +moot/schedule <sept>=<when-text>");
        return;
      }
      const sname = arg.slice(0, eqIdx).trim();
      const when  = arg.slice(eqIdx + 1).trim();
      if (!sname || !when) {
        u.send("Usage: +moot/schedule <sept>=<when-text>");
        return;
      }
      const sept = await findSeptByName(sname);
      if (!sept) { u.send(`No sept named "${sname}".`); return; }
      if (!await isMootAuthority(u, sept)) {
        u.send("Only staff or the sept's Master of the Howl may schedule moots.");
        return;
      }
      const moot = await createMoot(sept.id, Date.now(), when);
      u.send(`%cgMoot scheduled for sept "${sept.name}".%cn  (${when})  id=${moot.id.slice(0, 8)}`);
      return;
    }

    // -- /open  (in caern room of the sept) ----------------------------------
    if (sw === "open") {
      const here = u.here as { id: string } | undefined;
      if (!here?.id) { u.send("You are nowhere."); return; }
      const caern = await findCaernByRoom(here.id);
      if (!caern) {
        u.send("You must be in a caern-bound room to open a moot.");
        return;
      }
      const sept = await findSeptByCaern(caern.id);
      if (!sept) {
        u.send(`Caern "${caern.name}" is not bound to a sept yet. ` +
          `Ask staff to +sept/bind.`);
        return;
      }
      if (!await isMootAuthority(u, sept)) {
        u.send("Only staff or the sept's Master of the Howl may open the moot.");
        return;
      }
      const existing = await findOpenMootForSept(sept.id);
      if (existing) {
        u.send(`%crSept "${sept.name}" already has an open moot ` +
          `(phase: ${fmtPhase(existing.phase)}).%cn`);
        return;
      }
      const moots = await findMootsForSept(sept.id);
      const scheduled = moots
        .filter((m) => m.phase === "scheduled")
        .sort((a, b) => b.scheduledAt - a.scheduledAt);
      const moot = scheduled[0];
      if (!moot) {
        u.send(`No scheduled moot for sept "${sept.name}". ` +
          `Schedule one first with +moot/schedule.`);
        return;
      }
      moot.phase = "opening-howl";
      moot.openedAt = Date.now();
      await saveMoot(moot);
      u.send(`%cgThe moot of "${sept.name}" begins -- Opening Howl.%cn`);
      return;
    }

    // -- /attend -------------------------------------------------------------
    if (sw === "attend") {
      const here = u.here as { id: string } | undefined;
      if (!here?.id) { u.send("You are nowhere."); return; }
      const moot = await findActiveMootForCaernRoom(here.id);
      if (!moot) {
        u.send("No active moot in this caern room.");
        return;
      }
      if (!isMoothActive(moot.phase)) {
        u.send(`The moot is not currently in session (phase: ${fmtPhase(moot.phase)}).`);
        return;
      }
      const char = await findByPlayer(u.me.id);
      if (!char) { u.send("You have no character on file."); return; }
      if (char.splat !== "wta") {
        u.send("Only Garou may formally attend a moot.");
        return;
      }
      if (moot.attendees.includes(char.id)) {
        u.send("Already attending.");
        return;
      }
      moot.attendees = [...moot.attendees, char.id];
      await saveMoot(moot);
      u.send(`%cgYou take your place at the moot.%cn`);
      return;
    }

    // -- /phase <next|<name>|close>  (staff or MotH) -------------------------
    if (sw === "phase") {
      const here = u.here as { id: string } | undefined;
      if (!here?.id) { u.send("You are nowhere."); return; }
      const moot = await findActiveMootForCaernRoom(here.id);
      if (!moot) {
        u.send("No active moot in this caern room.");
        return;
      }
      const sept = await findSeptById(moot.septId);
      if (!sept) { u.send("Moot's sept record is missing -- ask staff."); return; }
      if (!await isMootAuthority(u, sept)) {
        u.send("Only staff or the Master of the Howl may advance the phase.");
        return;
      }
      const target = arg.toLowerCase().trim();
      let nextP: MoothPhase | null = null;
      if (target === "next") {
        nextP = nextPhase(moot.phase);
      } else if (target === "close") {
        nextP = "closed";
      } else if ((MOOT_PHASE_ORDER as string[]).includes(target)) {
        nextP = target as MoothPhase;
      } else {
        u.send("Usage: +moot/phase <next|opening-howl|inner-sky|cracking-the-bone|revel|close>");
        return;
      }
      if (!nextP) { u.send("The moot is already closed."); return; }
      if (nextP === "scheduled") {
        u.send("Cannot revert to scheduled.");
        return;
      }
      // Closing through /phase delegates to the close path so attendee
      // honor awards still fire.
      if (nextP === "closed") {
        await closeMoot(u, moot);
        return;
      }
      moot.phase = nextP;
      await saveMoot(moot);
      u.send(`%cgMoot advances to ${MOOT_PHASE_INFO[nextP].name}.%cn`);
      return;
    }

    // -- /award <target>=<track>:<N> <reason>  (staff, during bone/revel) ---
    if (sw === "award") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const here = u.here as { id: string } | undefined;
      if (!here?.id) { u.send("You are nowhere."); return; }
      const moot = await findActiveMootForCaernRoom(here.id);
      if (!moot) {
        u.send("No active moot in this caern room.");
        return;
      }
      if (moot.phase !== "cracking-the-bone" && moot.phase !== "revel") {
        u.send(
          "Renown awards happen during Cracking the Bone or the Revel " +
            `(current phase: ${fmtPhase(moot.phase)}).`,
        );
        return;
      }
      const eqIdx = arg.indexOf("=");
      if (eqIdx < 0) {
        u.send("Usage: +moot/award <target>=<track>:<N> <reason>");
        return;
      }
      const targetName = arg.slice(0, eqIdx).trim();
      const spec = arg.slice(eqIdx + 1).trim();
      const parsed = parseTrackSpec(spec);
      if (typeof parsed === "string") { u.send(`%cr${parsed}%cn`); return; }
      const { track, amount, reason } = parsed;
      if (!reason) {
        u.send("A reason is required for moot renown awards.");
        return;
      }
      const targetObj = await u.util.target(u.me, targetName, true);
      if (!targetObj) { u.send(`Player "${targetName}" not found.`); return; }
      const tchar = await findByPlayer(targetObj.id);
      if (!tchar) {
        u.send(`${u.util.displayName(targetObj, u.me)} has no character on file.`);
        return;
      }
      if (tchar.splat !== "wta") {
        u.send("Renown applies to Werewolf characters only.");
        return;
      }
      // Use awardRenown for parity with +renown/award.
      const { awardRenown } = await import("../core/renown.ts");
      const res = awardRenown(tchar, track, amount);
      if (!res.ok) { u.send(`%cr${res.message}%cn`); return; }
      await saveChar(tchar);
      moot.renownAwards = [
        ...moot.renownAwards,
        { charId: tchar.id, track, amount, reason, awardedAt: Date.now() },
      ];
      await saveMoot(moot);
      u.send(`%cg${u.util.displayName(targetObj, u.me)} -- +${amount} ${track} renown. (${reason})%cn`);
      return;
    }

    // -- /close --------------------------------------------------------------
    if (sw === "close") {
      const here = u.here as { id: string } | undefined;
      if (!here?.id) { u.send("You are nowhere."); return; }
      const moot = await findActiveMootForCaernRoom(here.id);
      if (!moot) {
        u.send("No active moot in this caern room.");
        return;
      }
      const sept = await findSeptById(moot.septId);
      if (!sept) { u.send("Moot's sept record is missing -- ask staff."); return; }
      if (!await isMootAuthority(u, sept)) {
        u.send("Only staff or the Master of the Howl may close the moot.");
        return;
      }
      await closeMoot(u, moot);
      return;
    }

    // -- /find <id|sept-name>  (debug aid for tests + staff) -----------------
    if (sw === "find") {
      if (!arg) { u.send("Usage: +moot/find <sept-name>"); return; }
      const sept = await findSeptByName(arg);
      if (!sept) { u.send(`No sept named "${arg}".`); return; }
      const all = await findMootsForSept(sept.id);
      const lines: string[] = [header(`Moots for ${sept.name}`)];
      if (all.length === 0) lines.push("  (none)");
      for (const m of all) {
        lines.push(`  ${m.id.slice(0, 8)}  ${fmtPhase(m.phase).padEnd(18)} ${fmtDate(m.scheduledAt)}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    u.send(`Unknown switch /${sw}. See +help moot.`);
  },
});

/**
 * Shared close path: marks the moot closed and applies +0.5 temp Honor to
 * every attendee for showing up. Direct write because awardRenown gates on
 * positive-integer amounts; the closing award is a fractional canon
 * gesture rather than a staff-driven boost.
 */
async function closeMoot(u: IUrsamuSDK, moot: IMoot): Promise<void> {
  const sept = await findSeptById(moot.septId);
  const now = Date.now();
  const awarded: string[] = [];
  for (const cid of moot.attendees) {
    const c = await findById(cid);
    if (!c) continue;
    if (c.splat !== "wta") continue;
    const temp = c.renownTemp ?? { glory: 0, honor: 0, wisdom: 0 };
    const next = { glory: temp.glory, honor: temp.honor + 0.5, wisdom: temp.wisdom };
    c.renownTemp = next;
    await saveChar(c);
    moot.renownAwards = [
      ...moot.renownAwards,
      {
        charId: cid,
        track: "honor",
        amount: 0.5,
        reason: `attended sept moot ${moot.id.slice(0, 8)}`,
        awardedAt: now,
      },
    ];
    awarded.push(c.moniker || c.fullName || c.deedName || cid);
  }
  moot.phase = "closed";
  moot.closedAt = now;
  await saveMoot(moot);
  let msg = `%cgThe moot of "${sept?.name ?? "(missing)"}" ends.%cn`;
  if (awarded.length > 0) {
    msg += `  ${awarded.length} attendee(s) gain +0.5 temp Honor.`;
  }
  u.send(msg);
}

// Type hint export for tests.
export type { IWoDChar };
