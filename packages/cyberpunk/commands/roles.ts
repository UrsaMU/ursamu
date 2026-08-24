/**
 * +role -- Role Ability Commands for All 10 CPR Roles
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter } from "../db/schemas.ts";
import { getRole, ROLES } from "../data/roles.ts";
import { rollD10Critical, skillCheck } from "../engine/dice.ts";
import { emitRoleAbility } from "../engine/emitters.ts";
import { bar, div, hdr, lbl, val, acc, dim, ARR, ERR, OK, row, wrap } from "./chargen.ts";

addCmd({
  name: "+role",
  pattern: /^\+role(?:\/(ability|rank|info|level))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+role[/<switch>] [<argument>]  -- Role ability and information.

Switches:
  /info              Show your role and current rank description.
  /ability [single|small|large]  Use your role ability. Rockerboy: crowd size sets DV (single=8, small=10, large=12).
  /rank              Show all rank descriptions for your role.
  /level <1-10>      (Admin) Set role rank.

Examples:
  +role/info               See your role ability description.
  +role/ability            Activate your role ability.
  +role/rank               Show all rank tiers.
  +role/level 6            (Admin) Set rank to 6.`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "info").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const roleDef = getRole(cpr.role);

    if (!sw || sw === "info") {
      const rankDesc = roleDef.rankDescriptions[cpr.roleRank] ?? "No description.";
      u.send([
        bar(),
        hdr(`ROLE: ${roleDef.displayName}`),
        bar(),
        row("ABILITY",    val(roleDef.abilityName)),
        row("RANK",       val(`${cpr.roleRank}`)),
        div(),
        ...wrap(roleDef.description),
        div(),
        `  ${lbl(`Rank ${cpr.roleRank}:`)} ${rankDesc}`,
        bar(),
      ].join("\r\n"));
      return;
    }

    if (sw === "rank") {
      const lines: string[] = [
        bar(),
        hdr(`${roleDef.displayName} -- RANK TABLE`),
        bar(),
      ];
      for (let r = 1; r <= 10; r++) {
        const marker = r === cpr.roleRank ? acc(">>") : "  ";
        lines.push(`  ${marker} ${lbl(`Rank ${r}:`)} ${roleDef.rankDescriptions[r] ?? dim("--")}`);
      }
      lines.push(bar());
      u.send(lines.join("\r\n"));
      return;
    }

    if (sw === "ability") {
      await useRoleAbility(u, cpr, arg);
      return;
    }

    if (sw === "level") {
      const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
      if (!isAdmin) { u.send(`${ERR}Only admins can set role rank.`); return; }
      const level = parseInt(arg, 10);
      if (isNaN(level) || level < 1 || level > 10) { u.send(`${ERR}Rank must be 1-10.`); return; }
      await u.db.modify(u.me.id, "$set", { "state.cpr.roleRank": level });
      u.send(`${OK}${lbl(roleDef.displayName)} rank set to ${val(level)}.`);
    }
  },
});

async function useRoleAbility(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  const roleDef = getRole(cpr.role);
  const name = u.util.displayName(u.me, u.me);

  // Each role has a specific ability mechanic
  switch (cpr.role) {
    case "rockerboy": {
      // Charismatic Impact: COOL + Charismatic Impact Rank + 1d10 vs DV
      // DV depends on crowd size: single=8, small=10, large=12
      const sizeArg = arg.toLowerCase().trim();
      let crowdLabel: string;
      let dv: number;
      if (sizeArg === "single") {
        crowdLabel = "single target"; dv = 8;
      } else if (sizeArg === "large") {
        crowdLabel = "large group (7+)"; dv = 12;
      } else {
        crowdLabel = "small group (2-6)"; dv = 10; // default
      }
      const { total: roll, base } = rollD10Critical();
      const total = cpr.stats.cool + cpr.roleRank + roll;
      const success = total >= dv;
      u.send([
        div(),
        `  ${lbl("CHARISMATIC IMPACT")} -- ${val(name)} vs ${acc(crowdLabel)}`,
        row("ROLL", `${dim(`COOL(${cpr.stats.cool})`)} + ${dim(`Rank(${cpr.roleRank})`)} + ${dim(`d10(${base})`)} = ${val(total)}`),
        row("DV",   `${val(dv)} -- ${success ? `${OK}SUCCESS` : `${ERR}FAILED`}`),
        div(),
      ].join("\r\n"));
      break;
    }
    case "solo": {
      // Combat Awareness: redistribute points (display current allocation)
      u.send([
        div(),
        `  ${lbl("COMBAT AWARENESS")}  ${dim(`Rank ${cpr.roleRank}`)} -- ${val(cpr.roleRank)} pts/round`,
        div(),
        `  ${dim("Options:")} Damage Deflection, Initiative Reaction, Spot Weakness,`,
        `           Threat Detection, Precision Attack`,
        `  ${dim("(Distribute via RP. Bonuses apply until next round.)")}`,
        div(),
      ].join("\r\n"));
      break;
    }
    case "netrunner": {
      u.send([
        div(),
        `  ${lbl("INTERFACE")}  ${dim(`Rank ${cpr.roleRank}`)} -- NET Actions/turn: ${val(netActionsDisplay(cpr.roleRank))}`,
        `  ${ARR}Use ${val("+netrun")} to access NET architectures.`,
        div(),
      ].join("\r\n"));
      break;
    }
    case "medtech": {
      const specs = (cpr.roleData as Record<string, unknown>)?.medicineSpecialties as Record<string, number> | undefined;
      const lines: string[] = [
        div(),
        `  ${lbl("MEDICINE SPECIALTY")}  ${dim(`Rank ${cpr.roleRank}`)}`,
      ];
      if (specs) {
        for (const [spec, rank] of Object.entries(specs)) {
          lines.push(row(spec, val(`${rank}`)));
        }
      }
      lines.push(`  ${ARR}Use ${val("+pharma")} for pharmaceutical synthesis.`);
      lines.push(div());
      u.send(lines.join("\r\n"));
      break;
    }
    case "tech": {
      const makerPts = cpr.roleRank * 2;
      u.send([
        div(),
        `  ${lbl("MAKER")}  ${dim(`Rank ${cpr.roleRank}`)} -- ${val(makerPts)} specialty points`,
        `  ${dim("Specialties:")} Field, Upgrade, Fabrication, Invention`,
        `  ${ARR}Use ${val("+craft")} to begin a project.`,
        div(),
      ].join("\r\n"));
      break;
    }
    case "media": {
      const believability = Math.min(7, Math.floor(cpr.roleRank / 2) + 1);
      u.send([
        div(),
        `  ${lbl("CREDIBILITY")}  ${dim(`Rank ${cpr.roleRank}`)} -- Believability: ${val(`${believability}/10`)}`,
        div(),
      ].join("\r\n"));
      break;
    }
    case "exec": {
      const { total: roll, base } = rollD10Critical();
      const total = cpr.stats.cool + cpr.roleRank + roll;
      const success = total >= 8;
      u.send([
        div(),
        `  ${lbl("TEAMWORK")}  ${dim(`Rank ${cpr.roleRank}`)} -- Team members: ${val(cpr.roleRank)}`,
        row("ACTIVATION", `${dim(`d10(${base})`)} -> ${val(total)} vs DV8 -- ${success ? `${OK}ACTIVATED!` : `${ERR}Failed`}`),
        div(),
      ].join("\r\n"));
      break;
    }
    case "lawman": {
      // Backup: roll 1d10 ≤ Rank to determine if backup arrives at all
      const backupRoll = Math.floor(Math.random() * 10) + 1;
      const backupArrives = backupRoll <= cpr.roleRank;
      if (!backupArrives) {
        u.send([
          div(),
          `  ${lbl("BACKUP")}  ${dim(`Rank ${cpr.roleRank}`)} -- ${dim(`Roll: ${backupRoll}`)}`,
          `  ${ERR}Backup called -- no response.`,
          div(),
        ].join("\r\n"));
        break;
      }
      const supportLevel = cpr.roleRank <= 3 ? "1 patrol officer" : cpr.roleRank <= 6 ? "2 officers + vehicle" : "full squad + AV";
      u.send([
        div(),
        `  ${lbl("BACKUP")}  ${dim(`Rank ${cpr.roleRank}`)} -- ${dim(`Roll: ${backupRoll}`)} ${OK}Backup en route!`,
        row("SUPPORT", val(supportLevel)),
        `  ${dim("(Backup arrives in 1d10 x 10 minutes in Night City.)")}`,
        div(),
      ].join("\r\n"));
      break;
    }
    case "fixer": {
      u.send([
        div(),
        `  ${lbl("OPERATOR")}  ${dim(`Rank ${cpr.roleRank}`)}`,
        row("NIGHT MARKET",    cpr.roleRank >= 5 ? `${OK}Available` : `${dim("[Rank 5+]")}`),
        row("MIDNIGHT MARKET", cpr.roleRank >= 9 ? `${OK}Available` : `${dim("[Rank 9+]")}`),
        `  ${ARR}Use ${val("+market/open")} to open a market.`,
        div(),
      ].join("\r\n"));
      break;
    }
    case "nomad": {
      const familySize = cpr.roleRank <= 3 ? "small family (4-6)" : cpr.roleRank <= 6 ? "medium clan (12-20)" : "large pack (30+)";
      u.send([
        div(),
        `  ${lbl("MOTO")}  ${dim(`Rank ${cpr.roleRank}`)} -- Family: ${val(familySize)}`,
        `  ${dim("Family provides backup, supplies, and vehicle repairs.")}`,
        div(),
      ].join("\r\n"));
      break;
    }
    default:
      u.send(`${ERR}Role ability display not configured for ${val(`"${cpr.role}"`)}.`);
  }

  await emitRoleAbility(u.me, cpr.role, cpr.roleRank);
}

function netActionsDisplay(rank: number): number {
  if (rank >= 10) return 5;
  if (rank >= 7) return 4;
  if (rank >= 4) return 3;
  return 2;
}
