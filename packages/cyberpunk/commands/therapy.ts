/**
 * +therapy -- Humanity Recovery and Cyberpsychosis Treatment
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import { therapyDV, applyTherapy, cyberpsychosisSeverity } from "../engine/cyberpsychosis.ts";
import { recalcDerived } from "../engine/character.ts";
import { emitTherapySession, emitCyberpsychosisReduced } from "../engine/emitters.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap } from "./chargen.ts";

addCmd({
  name: "+therapy",
  pattern: /^\+therapy(?:\/(session|status|crisis))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+therapy[/<switch>] [<target>]  -- Humanity recovery and cyberpsychosis treatment.

Requires Medtech role or admin. Each session takes ~1 week (RP time).
Successful therapy restores 2d6 Humanity (~ HL reduction).

Switches:
  /status [<target>]    Check humanity and therapy status.
  /session [<target>]   Conduct a therapy session.
  /crisis <target>      Emergency cyberpsychosis intervention.

Examples:
  +therapy/status           Check your own humanity.
  +therapy/session Rogue    Conduct therapy for Rogue.
  +therapy/crisis Patient   Emergency intervention.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "status").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (!sw || sw === "status") { await showStatus(u, cpr, arg); return; }
    if (sw === "session") { await conductSession(u, cpr, arg); return; }
    if (sw === "crisis") { await conductCrisis(u, cpr, arg); return; }
    u.send(`${ERR}Unknown switch ${val(`"/${sw}"`)}.`);
  },
});

async function showStatus(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  let target = u.me;
  let targetCpr = cpr;

  if (arg) {
    const t = await u.util.target(u.me, arg, true);
    if (!t) { u.send(`${ERR}Target not found.`); return; }
    target = t;
    targetCpr = t.state.cpr as ICPRCharacter | undefined ?? cpr;
  }

  const empPct = Math.round(
    (targetCpr.stats.emp / targetCpr.stats.empBase) * 100,
  );
  const severity = cyberpsychosisSeverity(
    targetCpr.stats.emp,
    targetCpr.stats.empBase,
    targetCpr.humanityLoss,
  );
  const dv = therapyDV(targetCpr.humanityLoss);
  const tName = u.util.displayName(target, u.me);

  u.send([
    bar(),
    hdr(`RECALIBRATION STATUS: ${tName}`),
    bar(),
    row(
      "EMP",
      `${val(targetCpr.stats.emp)}${dim("/")}` +
        `${val(targetCpr.stats.empBase)} ${dim(`(${empPct}%)`)}`,
    ),
    row("HL", val(`${targetCpr.humanityLoss}`)),
    row("SESSION DV", val(`${dv}`)),
    row(
      "STATUS",
      severity === "none" || severity === "mild"
        ? `${OK}Within norms`
        : `${ERR}CYBERPSYCHOSIS -- ${severity.toUpperCase()}`,
    ),
    bar(),
  ].join("\r\n"));
}

async function conductSession(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const canTreat = cpr.role === "medtech" || u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (!canTreat) { u.send(`${ERR}Only Medtech characters or admins can conduct recalibration sessions.`); return; }

  const targetName = arg || u.me.name;
  const target = await u.util.target(u.me, targetName || "", arg ? true : false);
  if (!target) { u.send(`${ERR}Target not found.`); return; }

  const targetCpr = target.state.cpr as ICPRCharacter | undefined;
  if (!targetCpr?.chargenComplete) { u.send(`${ERR}${u.util.displayName(target, u.me)} has no character.`); return; }

  const tName = u.util.displayName(target, u.me);
  if (targetCpr.humanityLoss === 0) { u.send(`${ARR}${val(tName)} has full humanity. No recalibration needed.`); return; }

  const dv = therapyDV(targetCpr.humanityLoss);
  const therapistSkill = cpr.skills["medicine"] ?? cpr.skills["psychiatry"] ?? cpr.skills["paramedic"] ?? 0;
  const roll = Math.floor(Math.random() * 10) + 1;
  const total = cpr.stats.tech + therapistSkill + roll;

  u.send([
    div(),
    `  ${lbl("RECALIBRATION SESSION")} -- ${val(tName)}`,
    row("ROLL",  `${dim(`d10(${roll})`)} -> ${val(total)}`),
    row("DV",    val(`${dv}`)),
    div(),
  ].join("\r\n"));

  const therapy = applyTherapy(targetCpr, total, dv);
  await emitTherapySession(
    u.me.id,
    u.me.name ?? "Unknown",
    target.id,
    tName,
    total,
    dv,
    therapy.success,
    therapy.hlReduced,
  );

  if (therapy.success) {
    const updatedChar = {
      ...targetCpr,
      humanityLoss: therapy.newHL,
      stats: { ...targetCpr.stats, emp: therapy.newEMP },
    };
    const recalced = recalcDerived(updatedChar);
    await u.db.modify(target.id, "$set", {
      "state.cpr.humanityLoss": recalced.humanityLoss,
      "state.cpr.stats": recalced.stats,
    });
    if (therapy.hlReduced > 0) {
      await emitCyberpsychosisReduced(
        target.id,
        tName,
        therapy.hlReduced,
        therapy.newEMP - targetCpr.stats.emp,
        therapy.newEMP,
      );
    }
    u.send([
      `  ${OK}Session effective. Recovered ` +
        `${val(String(therapy.hlReduced))} HL.`,
      row(
        "EMP",
        `${val(String(recalced.stats.emp))}${dim("/")}` +
          `${val(String(recalced.stats.empBase))}`,
      ),
      div(),
    ].join("\r\n"));
    if (target.id !== u.me.id) {
      u.send(
        `${OK}Your humanity feels more grounded after the session.`,
        target.id,
      );
    }
  } else {
    u.send(
      `  ${ERR}Session was not effective. No change. ` +
        `Try again next session.\r\n${div()}`,
    );
  }
}

async function conductCrisis(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
  if (cpr.role !== "medtech" && !isAdmin) { u.send(`${ERR}Only Medtech or admins can conduct crisis intervention.`); return; }
  if (!arg) { u.send(`${ERR}Specify target: ${val("+therapy/crisis <target>")}`); return; }

  const target = await u.util.target(u.me, arg, true);
  if (!target) { u.send(`${ERR}Target not found.`); return; }
  const targetCpr = target.state.cpr as ICPRCharacter | undefined;
  if (!targetCpr?.chargenComplete) { u.send(`${ERR}Target has no character.`); return; }

  const severity = cyberpsychosisSeverity(
    targetCpr.stats.emp,
    targetCpr.stats.empBase,
    targetCpr.humanityLoss,
  );
  const tName = u.util.displayName(target, u.me);
  if (severity === "none" || severity === "mild") {
    u.send(
      `${ARR}${val(tName)} is not in cyberpsychotic crisis.`,
    );
    return;
  }

  // Crisis intervention: harder DV, but provides temporary stabilization
  const roll = Math.floor(Math.random() * 10) + 1;
  const skill = cpr.skills["medicine"] ?? cpr.skills["psychiatry"] ?? cpr.skills["paramedic"] ?? 0;
  const total = cpr.stats.tech + skill + roll;
  const dv = 20; // Crisis intervention DV20

  u.send([
    bar(),
    hdr("CRISIS INTERVENTION"),
    bar(),
    row("PATIENT",   `${val(tName)} ${dim(`(${severity.toUpperCase()})`)}`),
    row("ROLL",      `${dim(`d10(${roll})`)} -> ${val(total)}`),
    row("DV",        val(`${dv}`)),
    div(),
  ].join("\r\n"));

  if (total >= dv) {
    // Temporarily grant +2 EMP for scene
    await u.db.modify(target.id, "$set", { "state.cpr.stats.emp": Math.min(targetCpr.stats.empBase, targetCpr.stats.emp + 2) });
    u.send([
      `  ${OK}${val(tName)} STABILIZED -- +2 EMP temporarily.`,
      `  ${ERR}Full recalibration still required.`,
      bar(),
    ].join("\r\n"));
    u.send(`${OK}The intervention gives you a brief moment of clarity.`, target.id);
  } else {
    u.send(`  ${ERR}Intervention failed. The crisis continues.\r\n${bar()}`);
  }
}
