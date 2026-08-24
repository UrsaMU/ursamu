/**
 * +cpr -- Admin Tools for CPR Plugin
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter, StatKey, Role } from "../db/schemas.ts";
import { ROLES } from "../data/roles.ts";
import { recalcDerived, STAT_MIN, STAT_MAX } from "../engine/character.ts";
import {
  approveDraft,
  rejectDraft,
} from "../engine/chargen-ops.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row } from "./chargen.ts";

const STAT_KEYS: StatKey[] = ["int", "ref", "dex", "tech", "cool", "will", "luck", "move", "body", "emp"];

addCmd({
  name: "+ip",
  pattern: /^\+ip\s+(\S+)=(\d+)/i,
  lock: "connected admin+",
  category: "Cyberpunk RED",
  help: `+ip <target>=<amount>  -- Award Improvement Points to a player.

Switches:
  (none)

Examples:
  +ip Rogue=5        Award 5 IP to Rogue.
  +ip Johnny=3       Award 3 IP to Johnny.`,

  exec: async (u: IUrsamuSDK) => {
    const targetName = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const amount     = parseInt(u.cmd.args[1] ?? "", 10);

    if (!targetName || isNaN(amount) || amount <= 0) {
      u.send(`${ERR}Usage: ${val("+ip <target>=<amount>")} (amount must be a positive integer).`);
      return;
    }

    const target = await u.util.target(u.me, targetName || "", true);
    if (!target) { u.send(`${ERR}Target not found in sector.`); return; }

    const cpr = target.state.cpr as ICPRCharacter | undefined;
    if (!cpr) {
      u.send(`${ERR}${acc(u.util.displayName(target, u.me))} has no CPR data on file.`);
      return;
    }

    await u.db.modify(target.id, "$inc", {
      "state.cpr.improvementPoints": amount,
      "state.cpr.ipLifetime":        amount,
    });

    const newBalance = (cpr.improvementPoints ?? 0) + amount;
    u.send(
      `${OK}Awarded ${val(String(amount))} IP to ${acc(u.util.displayName(target, u.me))}. New balance: ${val(String(newBalance))} IP.`,
      target.id,
    );
    u.send(
      `${OK}${acc(u.util.displayName(u.me, u.me))} awarded you ${val(String(amount))} IP. Balance: ${val(String(newBalance))} IP.`,
    );
  },
});

/** Shared staff dispatch — short cmds + legacy +cpr/<sw>. */
async function runAdminSwitch(
  u: IUrsamuSDK,
  swRaw: string,
  argRaw: string,
): Promise<void> {
  const sw = swRaw.toLowerCase().trim();
  const arg = u.util.stripSubs(argRaw ?? "").trim();
  if (!sw) {
    u.send(
      `${ARR}Staff tools: ${val("+approve")} ${val("+reject")} ` +
        `${val("+heal")} ${val("+stat")} ${val("+skill")} ` +
        `${val("+eb")} ${val("+hl")} ${val("+cprinfo")}. ` +
        `Or ${val("+help +approve")}.`,
    );
    return;
  }
  if (sw === "stat" || sw === "setstat") {
    await adminSetStat(u, arg);
    return;
  }
  if (sw === "skill" || sw === "setskill") {
    await adminSetSkill(u, arg);
    return;
  }
  if (sw === "role" || sw === "setrole") {
    await adminSetRole(u, arg);
    return;
  }
  if (sw === "rank" || sw === "setrank") {
    await adminSetRank(u, arg);
    return;
  }
  if (sw === "eb" || sw === "seteb") {
    await adminSetEB(u, arg);
    return;
  }
  if (sw === "rep" || sw === "setrep") {
    await adminSetRep(u, arg);
    return;
  }
  if (sw === "hl" || sw === "sethl") {
    await adminSetHL(u, arg);
    return;
  }
  if (sw === "heal") {
    await adminHeal(u, arg);
    return;
  }
  if (sw === "approve") {
    await adminApprove(u, arg);
    return;
  }
  if (sw === "reject") {
    await adminReject(u, arg);
    return;
  }
  if (sw === "reset") {
    await adminReset(u, arg);
    return;
  }
  if (sw === "setmaker" || sw === "maker") {
    await adminSetMaker(u, arg);
    return;
  }
  if (sw === "info" || sw === "cprinfo") {
    await adminInfo(u, arg);
    return;
  }
  u.send(
    `${ERR}Unknown staff tool ${val(sw)}. Try ${val("+approve")}, ` +
      `${val("+heal")}, ${val("+stat")}, ${val("+cprinfo")}.`,
  );
}

function staffCmd(
  name: string,
  pattern: RegExp,
  help: string,
  switchName: string,
): void {
  addCmd({
    name,
    pattern,
    lock: "connected admin+",
    category: "Cyberpunk RED",
    help,
    exec: async (u: IUrsamuSDK) => {
      const arg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
      await runAdminSwitch(u, switchName, arg);
    },
  });
}

// ── Short staff commands (preferred) ───────────────────────────────────────

staffCmd(
  "+approve",
  /^\+approve\s+(.*)/i,
  `+approve <target>  -- Approve pending chargen (unlock play).

Examples:
  +approve glitch.exe`,
  "approve",
);

staffCmd(
  "+reject",
  /^\+reject\s+(.*)/i,
  `+reject <target>[=reason]  -- Reject pending chargen.

Examples:
  +reject glitch.exe
  +reject glitch.exe=need more crew hooks`,
  "reject",
);

staffCmd(
  "+heal",
  /^\+heal\s*(.*)/i,
  `+heal [<target>]  -- Fully heal a character (admin).

Examples:
  +heal
  +heal Rogue`,
  "heal",
);

staffCmd(
  "+stat",
  /^\+stat\s+(.*)/i,
  `+stat <target>/<stat>=<value>  -- Set a STAT (admin).

Examples:
  +stat Rogue/body=8`,
  "stat",
);

staffCmd(
  "+skill",
  /^\+skill\s+(.*)/i,
  `+skill <target>/<skill>=<value>  -- Set a skill (admin).

Examples:
  +skill Rogue/handgun=6`,
  "skill",
);

staffCmd(
  "+seteb",
  /^\+seteb\s+(.*)/i,
  `+seteb <target>=<amount>  -- Set eurodollar balance (admin).

Examples:
  +seteb Rogue=5000`,
  "eb",
);

staffCmd(
  "+hl",
  /^\+hl\s+(.*)/i,
  `+hl <target>=<value>  -- Set humanity loss (admin).

Examples:
  +hl Rogue=0`,
  "hl",
);

staffCmd(
  "+setrep",
  /^\+setrep\s+(.*)/i,
  `+setrep <target>=<0-10>  -- Set reputation (admin).

Examples:
  +setrep Rogue=5`,
  "rep",
);

// +role might confuse with chargen role pick — use +setrole
staffCmd(
  "+setrole",
  /^\+setrole\s+(.*)/i,
  `+setrole <target>=<role>  -- Change role (admin).

Examples:
  +setrole Rogue=fixer`,
  "role",
);

staffCmd(
  "+setrank",
  /^\+setrank\s+(.*)/i,
  `+setrank <target>=<1-10>  -- Set role rank (admin).

Examples:
  +setrank Rogue=6`,
  "rank",
);

staffCmd(
  "+cprinfo",
  /^\+cprinfo\s+(.*)/i,
  `+cprinfo <target>  -- Dump CPR sheet summary (admin).

Examples:
  +cprinfo glitch.exe`,
  "info",
);

staffCmd(
  "+cprreset",
  /^\+cprreset\s+(.*)/i,
  `+cprreset <target>  -- Wipe CPR sheet (draft or approved). Wizard+.

Examples:
  +cprreset glitch.exe`,
  "reset",
);

staffCmd(
  "+wipe",
  /^\+wipe\s+(.*)/i,
  `+wipe <target>  -- Wipe CPR sheet (draft or approved). Wizard+.

Same as +cprreset / +chargen/reset. Clears data so they can
run +chargen again.

Examples:
  +wipe glitch.exe`,
  "reset",
);

// Legacy namespace still works
addCmd({
  name: "+cpr",
  pattern: /^\+cpr(?:\/(\S+))?\s*(.*)/i,
  lock: "connected admin+",
  category: "Cyberpunk RED",
  help: `+cpr/<switch>  -- Legacy alias. Prefer short cmds:

  +approve  +reject  +heal  +stat  +skill  +seteb  +hl
  +setrep  +setrole  +setrank  +cprinfo  +cprreset  +wipe

Examples:
  +approve glitch.exe
  +wipe glitch.exe     Wipe approved or draft sheet
  +stat Rogue/body=8
  +heal Rogue          (old form still works)`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.cmd.args[1] ?? "";
    await runAdminSwitch(u, sw, arg);
  },
});

async function adminSetStat(u: IUrsamuSDK, arg: string): Promise<void> {
  // Format: target/stat=value
  const slashIdx = arg.indexOf("/");
  const eqIdx = arg.indexOf("=");
  if (slashIdx < 0 || eqIdx < 0) {
    u.send(`${ERR}Usage: ${val("+stat <target>/<stat>=<value>")}`);
    return;
  }
  const targetName = arg.slice(0, slashIdx).trim();
  const stat = arg.slice(slashIdx + 1, eqIdx).trim().toLowerCase() as StatKey;
  const statVal = parseInt(arg.slice(eqIdx + 1), 10);

  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (!cpr) { u.send(`${ERR}${acc(u.util.displayName(target, u.me))} has no CPR data on file.`); return; }
  if (!STAT_KEYS.includes(stat)) { u.send(`${ERR}Unknown stat ${val(stat)}. Valid: ${STAT_KEYS.map(val).join(dim(", "))}`); return; }
  if (isNaN(statVal) || statVal < STAT_MIN || statVal > STAT_MAX) {
    u.send(`${ERR}Value out of range -- must be ${acc(String(STAT_MIN))}${dim("-")}${acc(String(STAT_MAX))}.`);
    return;
  }

  const newStats = { ...cpr.stats, [stat]: statVal, ...(stat === "emp" ? { empBase: statVal } : {}) };
  const recalced = recalcDerived({ ...cpr, stats: newStats as typeof cpr.stats });
  await u.db.modify(target.id, "$set", {
    "state.cpr.stats": recalced.stats,
    "state.cpr.hp": recalced.hp,
    "state.cpr.swThreshold": recalced.swThreshold,
    "state.cpr.deathSave": recalced.deathSave,
  });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} ${lbl(stat.toUpperCase())} overridden to ${val(statVal)}.`);
}

async function adminSetSkill(u: IUrsamuSDK, arg: string): Promise<void> {
  const slashIdx = arg.indexOf("/");
  const eqIdx = arg.indexOf("=");
  if (slashIdx < 0 || eqIdx < 0) {
    u.send(`${ERR}Usage: ${val("+skill <target>/<skill>=<value>")}`);
    return;
  }
  const targetName = arg.slice(0, slashIdx).trim();
  const skill = arg.slice(slashIdx + 1, eqIdx).trim().toLowerCase().replace(/ /g, "_");
  const skillVal = parseInt(arg.slice(eqIdx + 1), 10);
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  if (isNaN(skillVal) || skillVal < 0 || skillVal > 10) {
    u.send(`${ERR}Skill value out of range -- must be ${acc("0")}${dim("-")}${acc("10")}.`);
    return;
  }
  await u.db.modify(target.id, "$set", { [`state.cpr.skills.${skill}`]: skillVal });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} ${lbl(skill)} ${dim("->")} ${val(skillVal)}.`);
}

async function adminSetRole(u: IUrsamuSDK, arg: string): Promise<void> {
  const [targetName, roleName] = arg.split("=").map((s) => s.trim());
  if (!targetName || !roleName) {
    u.send(`${ERR}Usage: ${val("+setrole <target>=<role>")}`);
    return;
  }
  if (!ROLES.find((r) => r.name === roleName)) {
    u.send(`${ERR}Unknown role ${val(roleName)}. Valid roles: ${ROLES.map((r) => acc(r.name)).join(dim(", "))}`);
    return;
  }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  await u.db.modify(target.id, "$set", { "state.cpr.role": roleName });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} Role reassigned to ${val(roleName)}.`);
}

async function adminSetRank(u: IUrsamuSDK, arg: string): Promise<void> {
  const [targetName, valStr] = arg.split("=").map((s) => s.trim());
  const rankVal = parseInt(valStr, 10);
  if (!targetName || isNaN(rankVal) || rankVal < 1 || rankVal > 10) {
    u.send(`${ERR}Usage: ${val("+setrank <target>=<1-10>")}`);
    return;
  }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  await u.db.modify(target.id, "$set", { "state.cpr.roleRank": rankVal });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} Role Rank set to ${val(rankVal)}.`);
}

async function adminSetEB(u: IUrsamuSDK, arg: string): Promise<void> {
  const [targetName, valStr] = arg.split("=").map((s) => s.trim());
  const ebVal = parseInt(valStr, 10);
  if (!targetName || isNaN(ebVal)) {
    u.send(`${ERR}Usage: ${val("+seteb <target>=<amount>")}`);
    return;
  }
  if (ebVal < 0) { u.send(`${ERR}EB cannot be set below 0.`); return; }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  await u.db.modify(target.id, "$set", { "state.cpr.eurodollars": ebVal });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} EB balance set to ${val(ebVal)} ${dim("eb")}.`);
}

async function adminSetRep(u: IUrsamuSDK, arg: string): Promise<void> {
  const [targetName, valStr] = arg.split("=").map((s) => s.trim());
  const repVal = parseInt(valStr, 10);
  if (!targetName || isNaN(repVal) || repVal < 0 || repVal > 10) {
    u.send(`${ERR}Usage: ${val("+rep <target>=<0-10>")}`);
    return;
  }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  await u.db.modify(target.id, "$set", { "state.cpr.reputation": repVal });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} Reputation set to ${val(repVal)}.`);
}

async function adminSetHL(u: IUrsamuSDK, arg: string): Promise<void> {
  const [targetName, valStr] = arg.split("=").map((s) => s.trim());
  const hlVal = parseInt(valStr, 10);
  if (!targetName || isNaN(hlVal) || hlVal < 0) {
    u.send(`${ERR}Usage: ${val("+hl <target>=<value>")}`);
    return;
  }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (!cpr) { u.send(`${ERR}${acc(u.util.displayName(target, u.me))} has no CPR data on file.`); return; }
  const recalced = recalcDerived({ ...cpr, humanityLoss: hlVal });
  await u.db.modify(target.id, "$set", { "state.cpr.humanityLoss": hlVal, "state.cpr.stats": recalced.stats });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} HL set to ${val(hlVal)}. ${lbl("EMP")} recalculated: ${val(recalced.stats.emp)}.`);
}

async function adminHeal(u: IUrsamuSDK, arg: string): Promise<void> {
  const target = await u.util.target(u.me, arg || u.me.name || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (!cpr) { u.send(`${ERR}${acc(u.util.displayName(target, u.me))} has no CPR data on file.`); return; }
  await u.db.modify(target.id, "$set", {
    "state.cpr.hp.current": cpr.hp.max,
    "state.cpr.woundState": "healthy",
    "state.cpr.deathSavePenalty": 0,
  });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} fully patched. ${lbl("HP")} ${val(cpr.hp.max)}${dim("/")}${val(cpr.hp.max)} ${dim("-- wound state cleared.")}`);
}

async function adminApprove(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  if (!arg) {
    u.send(`${ERR}Usage: ${val("+approve <target>")}`);
    return;
  }
  const target = await u.util.target(u.me, arg, true);
  if (!target) {
    u.send(`${ERR}Target not found in sector.`);
    return;
  }
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (!cpr) {
    u.send(
      `${ERR}${acc(u.util.displayName(target, u.me))} ` +
        `has no CPR data on file.`,
    );
    return;
  }
  const res = approveDraft(cpr);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  await u.db.modify(target.id, "$set", { "state.cpr": res.draft });
  const tname = u.util.displayName(target, u.me);
  try {
    const { emitChargenComplete } = await import(
      "../engine/emitters.ts"
    );
    await emitChargenComplete(
      target.id,
      target.name ?? tname,
      res.draft.role,
      res.draft.chargenMethod ?? "complete",
    );
  } catch (_) { /* non-fatal */ }
  u.send(
    `${OK}Approved ${acc(tname)} — play unlocked.`,
  );
  u.send(
    `${OK}Your chargen was approved. Type ${val("+sheet")}. ` +
      `Welcome to Night City.`,
    target.id,
  );
}

async function adminReject(
  u: IUrsamuSDK,
  arg: string,
): Promise<void> {
  if (!arg) {
    u.send(
      `${ERR}Usage: ${val("+reject <target>[=reason]")}`,
    );
    return;
  }
  const eq = arg.indexOf("=");
  const targetName = (eq >= 0 ? arg.slice(0, eq) : arg).trim();
  const reason = eq >= 0 ? arg.slice(eq + 1).trim() : "";
  const target = await u.util.target(u.me, targetName, true);
  if (!target) {
    u.send(`${ERR}Target not found in sector.`);
    return;
  }
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (!cpr) {
    u.send(
      `${ERR}${acc(u.util.displayName(target, u.me))} ` +
        `has no CPR data on file.`,
    );
    return;
  }
  const res = rejectDraft(cpr, reason);
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  await u.db.modify(target.id, "$set", { "state.cpr": res.draft });
  const tname = u.util.displayName(target, u.me);
  u.send(`${OK}Rejected ${acc(tname)} — back to draft.`);
  u.send(
    `${ARR}Your chargen was rejected.` +
      (reason ? ` Reason: ${val(reason)}` : "") +
      `  Edit with ${val("+chargen")} then resubmit.`,
    target.id,
  );
}

async function adminReset(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!arg) {
    u.send(
      `${ERR}Specify target: ${val("+cprreset <target>")} ` +
        `(wipes draft or approved sheet)`,
    );
    return;
  }
  const target = await u.util.target(u.me, arg, true);
  if (!target) {
    u.send(`${ERR}Target not found in sector.`);
    return;
  }
  const { wipeCharacter } = await import(
    "../src/chargen/wipe_core.ts"
  );
  const staffName = String(
    u.util.displayName(u.me, u.me) || u.me.name || "Staff",
  );
  const res = await wipeCharacter({
    playerId: String(target.id),
    staffName,
    notify: (pid, msg) => {
      u.send(msg, pid);
    },
  });
  if (!res.ok) {
    u.send(`${ERR}${res.error}`);
    return;
  }
  const tname = u.util.displayName(target, u.me);
  const note = !res.hadSheet
    ? dim("(no sheet was on file)")
    : res.wasApproved
    ? dim("(approved sheet)")
    : dim("(draft)");
  u.send(
    `${OK}CPR data purged for ${acc(tname)}. ` +
      `${note} ${dim("They can +chargen again.")}`,
  );
}

async function adminSetMaker(u: IUrsamuSDK, arg: string): Promise<void> {
  const slashIdx = arg.indexOf("/");
  const eqIdx = arg.indexOf("=");
  if (slashIdx < 0 || eqIdx < 0) {
    u.send(`${ERR}Usage: ${val("+cpr/setmaker <target>/<specialty>=<rank>")}`);
    return;
  }
  const targetName = arg.slice(0, slashIdx).trim();
  const specialty = arg.slice(slashIdx + 1, eqIdx).trim().toLowerCase();
  const makerVal = parseInt(arg.slice(eqIdx + 1), 10);
  const VALID = ["field", "upgrade", "fabrication", "invention", "surgery", "pharmaceuticals", "cryosystem_operation"];
  if (!VALID.includes(specialty)) {
    u.send(`${ERR}Unknown specialty ${val(specialty)}. Valid: ${VALID.map(acc).join(dim(", "))}`);
    return;
  }
  const target = await u.util.target(u.me, targetName || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  await u.db.modify(target.id, "$set", { [`state.cpr.roleData.makerSpecialties.${specialty}`]: makerVal });
  u.send(`${OK}${acc(u.util.displayName(target, u.me))} ${dim("--")} ${lbl(specialty)} specialty set to ${val(makerVal)}.`);
}

async function adminInfo(u: IUrsamuSDK, arg: string): Promise<void> {
  const target = await u.util.target(u.me, arg || u.me.name || "", true);
  if (!target) { u.send(`${ERR}Target not found in sector.`); return; }
  const cpr = target.state.cpr as ICPRCharacter | undefined;
  if (!cpr) { u.send(`${ERR}No CPR data on file for ${acc(u.util.displayName(target, u.me))}.`); return; }
  const s = cpr.stats;
  u.send([
    bar(),
    hdr(`SYSADMIN DUMP :: ${u.util.displayName(target, u.me)}`),
    bar(),
    row("ROLE",    `${val(cpr.role ?? "--")} ${dim("rank")} ${val(cpr.roleRank)}`),
    row(
      "CHARGEN",
      `${
        cpr.chargenComplete || cpr.chargenStatus === "approved"
          ? `${OK}approved`
          : cpr.chargenStatus === "pending"
          ? `${ARR}pending`
          : cpr.chargenStatus === "rejected"
          ? `${ERR}rejected`
          : `${ARR}draft`
      }  ${dim("stage:")} ${val(cpr.chargenStage ?? "--")}`,
    ),
    row(
      "NOTES",
      val(String((cpr.conceptNotes ?? "").length)) +
        dim(" chars"),
    ),
    div(),
    row("INT / REF / DEX",  `${val(s.int)} ${dim("/")} ${val(s.ref)} ${dim("/")} ${val(s.dex)}`),
    row("TECH / COOL / WILL", `${val(s.tech)} ${dim("/")} ${val(s.cool)} ${dim("/")} ${val(s.will)}`),
    row("LUCK / MOVE / BODY", `${val(s.luck)} ${dim("/")} ${val(s.move)} ${dim("/")} ${val(s.body)}`),
    row("EMP",     `${val(s.emp)} ${dim("base:")} ${val(s.empBase)}`),
    div(),
    row("HP",      `${val(cpr.hp.current)} ${dim("/")} ${val(cpr.hp.max)}`),
    row("WOUND",   val(cpr.woundState)),
    row("HL",      val(cpr.humanityLoss)),
    row("REP",     val(cpr.reputation)),
    row("EB",      `${val(cpr.eurodollars)} ${dim("eb")}`),
    div(),
    row("CYBERWARE",  val(cpr.cyberware.length)),
    row("INJURIES",   val(cpr.criticalInjuries.length)),
    row("SKILLS",     val(Object.keys(cpr.skills).length)),
    bar(),
  ].join("\r\n"));
}
