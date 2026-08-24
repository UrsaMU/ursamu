/**
 * +improve -- Improvement Point (IP) spending for skill and role advancement
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter } from "../db/schemas.ts";
import { SKILLS, skillDisplayName, getSkill } from "../data/skills.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, tbl } from "./chargen.ts";

/** Cost to advance a skill from currentRank → currentRank+1.  */
export function skillIpCost(currentRank: number): number {
  return currentRank * 2;
}

/** Cost to advance a role rank from currentRank → currentRank+1. */
export function roleIpCost(currentRank: number): number {
  return currentRank * 10;
}

addCmd({
  name: "+improve",
  pattern: /^\+improve(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+improve[/switch] [<argument>]  -- Spend Improvement Points to advance skills or role rank.

Switches:
  /skill <skillname>   Spend IP to raise a skill by 1 rank.
  /role                Spend IP to raise your role rank by 1.
  /balance             Show current IP balance and affordable advances.

Examples:
  +improve                    Show IP balance and spending options.
  +improve/balance            Show current IP and what you can afford.
  +improve/skill athletics    Raise Athletics by 1 rank (costs currentRank*2 IP).
  +improve/role               Raise your role rank by 1 (costs currentRank*10 IP).`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr) {
      u.send(`${ERR}No character data on file. Run ${val("+chargen")} first.`);
      return;
    }
    if (!cpr.chargenComplete) {
      u.send(`${ERR}Complete character generation before spending IP.`);
      return;
    }

    if (!sw || sw === "balance") {
      showBalance(u, cpr);
      return;
    }

    if (sw === "skill") {
      await spendOnSkill(u, cpr, arg);
      return;
    }

    if (sw === "role") {
      await spendOnRole(u, cpr);
      return;
    }

    u.send(`${ERR}Unknown switch ${val("/" + sw)}. Type ${val("+help +improve")} for valid switches.`);
  },
});

// --- Balance display ----------------------------------------------------------

function showBalance(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const ip = cpr.improvementPoints ?? 0;
  const ipLife = cpr.ipLifetime ?? 0;

  // Collect affordable skill advances
  const affordableSkills: string[][] = [];
  for (const skillDef of SKILLS) {
    const rank = cpr.skills[skillDef.name] ?? 0;
    if (rank >= 10) continue;
    const cost = skillIpCost(rank);
    if (cost <= ip) {
      affordableSkills.push([
        acc(skillDisplayName(skillDef.name)),
        val(String(rank)),
        dim("→"),
        val(String(rank + 1)),
        dim(`(${cost} IP)`),
      ]);
    }
  }

  const roleRank = cpr.roleRank ?? 1;
  const roleCost = roleIpCost(roleRank);
  const canAffordRole = roleRank < 10 && ip >= roleCost;

  u.send([
    bar(),
    hdr("IMPROVEMENT POINTS"),
    bar(),
    row("IP BALANCE",  val(String(ip))),
    row("IP LIFETIME", val(String(ipLife))),
    row("ROLE",        `${val(cpr.role?.toUpperCase() ?? "--")} ${dim("rank")} ${val(String(roleRank))}`),
    div(),
    canAffordRole
      ? `  ${ARR}Role advance: ${val(cpr.role?.toUpperCase() ?? "--")} ${dim("rank")} ${val(String(roleRank))} ${dim("→")} ${val(String(roleRank + 1))} ${dim(`(${roleCost} IP)`)}`
      : `  ${dim(`Role advance costs ${roleCost} IP (rank ${roleRank} → ${roleRank + 1}). ${ip < roleCost ? "Insufficient IP." : "Already max rank."}`)  }`,
    div(),
    `  ${lbl("AFFORDABLE SKILL ADVANCES")}`,
    "",
    ...(affordableSkills.length
      ? tbl(
        [
          { label: "SKILL", width: 30 },
          { label: "RANK", width: 4 },
          { label: "",      width: 2 },
          { label: "NEW",   width: 4 },
          { label: "COST",  width: 10 },
        ],
        affordableSkills,
      )
      : [`  ${dim("No affordable advances with current IP.")}`]),
    "",
    div(),
    `  ${dim("Use")} ${val("+improve/skill <name>")} ${dim("or")} ${val("+improve/role")} ${dim("to spend IP.")}`,
    bar(),
  ].join("\r\n"));
}

// --- Spend on skill ----------------------------------------------------------

async function spendOnSkill(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (!arg) {
    u.send(`${ERR}Usage: ${val("+improve/skill <skillname>")}`);
    return;
  }

  const skillKey = arg.toLowerCase().replace(/\s+/g, "_");
  const skillDef = getSkill(skillKey);
  if (!skillDef) {
    u.send(`${ERR}Unknown skill ${val(arg)}. Type ${val("+skills")} to browse available skills.`);
    return;
  }

  const currentRank = cpr.skills[skillKey] ?? 0;
  if (currentRank >= 10) {
    u.send(`${ERR}${acc(skillDisplayName(skillKey))} is already at maximum rank (10).`);
    return;
  }

  const cost = skillIpCost(currentRank);
  const ip   = cpr.improvementPoints ?? 0;

  if (ip < cost) {
    u.send(
      `${ERR}Insufficient IP. ${acc(skillDisplayName(skillKey))} ${dim(`rank ${currentRank} → ${currentRank + 1}`)} costs ${val(String(cost))} IP. You have ${val(String(ip))} IP.`,
    );
    return;
  }

  await u.db.modify(u.me.id, "$set",  { [`state.cpr.skills.${skillKey}`]: currentRank + 1 });
  await u.db.modify(u.me.id, "$inc",  { "state.cpr.improvementPoints": -cost });

  const remaining = ip - cost;
  u.send(
    `${OK}${acc(skillDisplayName(skillKey))} ${val(String(currentRank))} ${dim("→")} ${val(String(currentRank + 1))}  ${dim(`(cost: ${cost} IP)`)}  ${lbl("Remaining:")} ${val(String(remaining))} IP`,
  );
}

// --- Spend on role rank ------------------------------------------------------

async function spendOnRole(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const roleRank = cpr.roleRank ?? 1;
  if (roleRank >= 10) {
    u.send(`${ERR}Your role rank is already at maximum (10).`);
    return;
  }

  const cost = roleIpCost(roleRank);
  const ip   = cpr.improvementPoints ?? 0;

  if (ip < cost) {
    u.send(
      `${ERR}Insufficient IP. Role rank ${val(String(roleRank))} ${dim("→")} ${val(String(roleRank + 1))} costs ${val(String(cost))} IP. You have ${val(String(ip))} IP.`,
    );
    return;
  }

  await u.db.modify(u.me.id, "$set", { "state.cpr.roleRank": roleRank + 1 });
  await u.db.modify(u.me.id, "$inc", { "state.cpr.improvementPoints": -cost });

  const remaining = ip - cost;
  u.send(
    `${OK}${val(cpr.role?.toUpperCase() ?? "ROLE")} rank ${val(String(roleRank))} ${dim("→")} ${val(String(roleRank + 1))}  ${dim(`(cost: ${cost} IP)`)}  ${lbl("Remaining:")} ${val(String(remaining))} IP`,
  );
}
