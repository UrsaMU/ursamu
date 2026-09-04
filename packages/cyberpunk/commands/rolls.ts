/**
 * +roll -- CPR Skill Check and Dice Rolling
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, StatKey } from "../db/schemas.ts";
import { skillCheck, rollD10Critical, rollND6 } from "../engine/dice.ts";
import { SKILLS, skillDisplayName, getSkill } from "../data/skills.ts";
import {
  calcCurrentEMP,
  woundActionPenalty,
  getCyberwareSkillBonus,
} from "../engine/character.ts";
import { getCyberpsychosisPenalty } from "../engine/cyberpsychosis.ts";
import { emitGMRoll } from "../engine/emitters.ts";
import { sanitizeGMSummary } from "../engine/validation.ts";
import { val, acc, dim, good, bad, lbl, ARR, ERR, OK } from "./chargen.ts";

/** Vehicle skills that benefit from Nomad Moto bonus. */
const VEHICLE_SKILLS = new Set([
  "drive_land_vehicle",
  "pilot_air_vehicle",
  "pilot_sea_vehicle",
]);

const STAT_ALIASES: Record<string, StatKey> = {
  int: "int", intelligence: "int",
  ref: "ref", reflexes: "ref",
  dex: "dex", dexterity: "dex",
  tech: "tech", technique: "tech",
  cool: "cool",
  will: "will", willpower: "will",
  luck: "luck",
  move: "move",
  body: "body",
  emp: "emp", empathy: "emp",
};

addCmd({
  name: "+roll",
  pattern: /^\+roll\s+(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+roll <expression>  -- Roll dice or make a skill check.

Expressions:
  <stat>+<skill>             Roll stat+skill+1d10.
  <stat>+<skill> vs <DV>     Roll against a difficulty value.
  <stat>+<skill>+<modifier>  Add a flat modifier.
  <NdX>                      Roll N dice of X sides (e.g. 3d6).
  1d10                       Plain d10 roll.

Examples:
  +roll ref+handgun              Roll REF+Handgun.
  +roll cool+persuasion vs 15    Roll vs DV 15.
  +roll int+library_search+2     Add +2 modifier.
  +roll 3d6                      Roll 3d6 damage.`,

  exec: (u: IUrsamuSDK) => {
    const expr = u.util.stripSubs(u.cmd.args[0] ?? "").trim().toLowerCase();
    if (!expr) {
      u.send(`${ERR}Usage: ${val("+roll <stat>+<skill>")} or ${val("+roll <NdX>")}`);
      return;
    }

    // Plain dice roll: NdX
    if (/^\d*d\d+$/i.test(expr)) {
      rollPlainDice(u, expr);
      return;
    }

    // Skill check: stat+skill [+mod] [vs DV]
    const vsMatch  = expr.match(/^(.+?)\s+vs\s+(\d+)$/);
    const dvValue  = vsMatch ? parseInt(vsMatch[2], 10) : undefined;
    const checkExpr = vsMatch ? vsMatch[1] : expr;
    rollSkillCheck(u, checkExpr, dvValue);
  },
});

function rollPlainDice(u: IUrsamuSDK, expr: string): void {
  const match = expr.match(/^(\d*)d(\d+)$/i);
  if (!match) { u.send(`${ERR}Invalid dice expression.`); return; }
  const count = Math.max(1, parseInt(match[1] || "1", 10));
  const sides = parseInt(match[2], 10);
  if (count > 20 || sides > 100) { u.send(`${ERR}Dice expression too large.`); return; }

  const name = u.util.displayName(u.me, u.me);

  if (sides === 10 && count === 1) {
    const { base, extra, total } = rollD10Critical();
    let desc = `${lbl("1d10")} -> ${val(String(base))}`;
    if (extra !== 0) {
      desc += extra > 0
        ? ` + ${good(String(extra))} ${dim("(crit!)")}`
        : ` - ${bad(String(Math.abs(extra)))} ${dim("(fumble!)")}`;
    }
    u.send(`${acc(name)} rolls ${desc} ${dim("=")} ${val(String(total))}`);
    return;
  }

  if (sides === 6) {
    const dice  = rollND6(count);
    const total = dice.reduce((a, b) => a + b, 0);
    u.send(`${acc(name)} rolls ${lbl(`${count}d6`)} -> ${dim(`[${dice.join(", ")}]`)} ${dim("=")} ${val(String(total))}`);
    return;
  }

  // Generic dice
  const results = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total   = results.reduce((a, b) => a + b, 0);
  u.send(`${acc(name)} rolls ${lbl(`${count}d${sides}`)} -> ${dim(`[${results.join(", ")}]`)} ${dim("=")} ${val(String(total))}`);
}

function rollSkillCheck(u: IUrsamuSDK, expr: string, dv?: number): void {
  const cpr  = u.me.state.cpr as ICPRCharacter | undefined;
  const parts = expr.split("+").map((p) => p.trim());
  if (parts.length < 2) { u.send(`${ERR}Format: ${val("+roll <stat>+<skill>")}`); return; }

  const statKey = STAT_ALIASES[parts[0]];
  if (!statKey) {
    u.send(`${ERR}Unknown stat ${acc(`"${parts[0]}"`)}.  Valid: ${
      Object.keys(STAT_ALIASES).filter((k) => k === STAT_ALIASES[k]).join(", ")
    }`);
    return;
  }

  const skillName = parts[1].replace(/ /g, "_");
  const flatMod   = parts[2] ? parseInt(parts[2], 10) : 0;
  const skillDef  = getSkill(skillName);

  let statVal  = 5;
  let skillVal = 0;
  let woundPen = 0;
  let cyberBonus = 0;
  let liveEmp = 8;
  let empBase = 8;
  let hl = 0;

  if (cpr) {
    empBase = cpr.stats.empBase ?? cpr.stats.emp ?? 5;
    hl = cpr.humanityLoss ?? 0;
    // Derive EMP from HL every roll — don't trust a stale stats.emp
    liveEmp = Math.max(0, calcCurrentEMP(empBase, hl));

    // Full cyberpsychosis: character is GM-controlled, block all rolls
    if (liveEmp <= 0) {
      u.send(
        `${ERR}Your character has full cyberpsychosis and is ` +
          `under GM control.`,
      );
      return;
    }
    statVal    = (cpr.stats as Record<string, number>)[statKey] ?? 5;
    skillVal   = cpr.skills[skillName] ?? 0;
    woundPen   = woundActionPenalty(cpr.woundState);
    cyberBonus = getCyberwareSkillBonus(cpr.cyberware, skillName);

    // Lazy-repair stale EMP if sheet still shows psycho after HL clear
    if ((cpr.stats.emp ?? 0) !== liveEmp) {
      void u.db.modify(u.me.id, "$set", {
        "state.cpr.stats.emp": liveEmp,
      });
    }
  }

  // Penalty from EMP *lost to HL*, not absolute EMP (base 4–6 is fine)
  const skillCategory = skillDef?.category === "social" ? "social" : "other";
  const psychoPenalty = cpr
    ? getCyberpsychosisPenalty(liveEmp, skillCategory, empBase, hl)
    : 0;

  const totalSkill = skillVal + (flatMod || 0) + woundPen + cyberBonus + psychoPenalty;
  const result     = skillCheck(statVal, totalSkill, dv);

  // Nomad Moto bonus: +Rank on vehicle skill checks
  let motoBonus = 0;
  if (cpr && cpr.role === "nomad" && VEHICLE_SKILLS.has(skillName)) {
    motoBonus = cpr.roleRank;
  }
  const adjustedTotal = result.total + motoBonus;
  const adjustedSuccess = dv !== undefined ? adjustedTotal >= dv : undefined;

  const name       = u.util.displayName(u.me, u.me);
  const statLabel  = statKey.toUpperCase();
  const skillLabel = skillDef ? skillDisplayName(skillName) : skillName;

  // Build roll line
  let line = `${acc(name)} ${dim("::")} ${lbl(statLabel)}${dim(`(${statVal})`)} + ${lbl(skillLabel)}${dim(`(${skillVal})`)}`;
  if (flatMod !== 0) line += ` ${flatMod > 0 ? acc(`+${flatMod}`) : bad(String(flatMod))}`;
  if (woundPen < 0)  line += ` ${bad(`${woundPen}`)}${dim("(wound)")}`;
  line += ` + ${lbl("1d10")}${dim(`(${result.roll}`)}`;
  if (result.extra !== 0) line += result.extra > 0 ? acc(`+${result.extra}`) : bad(String(result.extra));
  line += `${dim(")")}`;

  if (cyberBonus > 0)     line += ` + ${lbl(`Cyber:${cyberBonus}`)}`;
  if (psychoPenalty < 0)  line += ` ${bad(`${psychoPenalty}`)}${dim("(Psycho)")}`;
  if (result.critSuccess) line += `  ${good("[CRIT!]")}`;
  if (result.critFail)    line += `  ${bad("[FUMBLE!]")}`;
  if (motoBonus > 0)      line += ` + ${lbl(`Moto:${motoBonus}`)}`;

  line += `  ${dim("=")} ${val(String(adjustedTotal))}`;

  if (dv !== undefined) {
    if (adjustedSuccess) {
      line += `  ${dim("vs DV")}${acc(String(dv))} ${dim("->")} ${OK}${good("SUCCESS")}`;
    } else {
      line += `  ${dim("vs DV")}${acc(String(dv))} ${dim("->")} ${bad("FAILURE")}`;
    }
  }

  u.send(line);
  u.here.broadcast?.(line, { exclude: [u.me.id] });

  // GM bridge
  const dvNote   = dv !== undefined ? ` vs DV${dv} -- ${adjustedSuccess ? "SUCCESS" : "FAILURE"}` : "";
  const critNote = result.critSuccess ? " [CRIT]" : result.critFail ? " [FUMBLE]" : "";
  const motoNote = motoBonus > 0 ? ` +Moto:${motoBonus}` : "";
  const gmName   = sanitizeGMSummary(u.util.displayName(u.me, u.me));
  emitGMRoll(
    u.me.location ?? "",
    u.me.id,
    gmName,
    sanitizeGMSummary(`${gmName} rolls ${statKey.toUpperCase()}+${skillLabel}: total ${adjustedTotal}${motoNote}${dvNote}${critNote}`),
  );
}

// -- +luck -- Spend luck on last roll ------------------------------------------

addCmd({
  name: "+luck",
  pattern: /^\+luck(?:\s+(\d+))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+luck [<points>]  -- Spend Luck points to boost a roll.

Luck adds directly to your last roll total. You have LUCK stat points per session.

Examples:
  +luck       Show current Luck pool.
  +luck 3     Spend 3 Luck points.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No runner data found.`); return; }

    const arg = (u.cmd.args[0] ?? "").trim();
    if (!arg) {
      u.send(`${ARR}Luck pool: ${val(String(cpr.luckRemaining))} / ${val(String(cpr.stats.luck))}`);
      return;
    }

    const spend = parseInt(arg, 10);
    if (isNaN(spend) || spend < 1) {
      u.send(`${ERR}Specify a positive number of Luck points.`);
      return;
    }
    if (spend > cpr.luckRemaining) {
      u.send(`${ERR}Not enough Luck. ${dim("Pool:")} ${val(String(cpr.luckRemaining))} remaining.`);
      return;
    }

    const newPool = cpr.luckRemaining - spend;
    await u.db.modify(u.me.id, "$set", { "state.cpr.luckRemaining": newPool });
    u.send(`${OK}Burned ${val(String(spend))} Luck.  Pool: ${val(String(newPool))} / ${val(String(cpr.stats.luck))}.  ${dim(`Add +${spend} to your last roll.`)}`);
  },
});
