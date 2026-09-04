/**
 * +humanity -- Humanity Regain from Non-Therapy Sources
 * CPR Core p.229 -- Regaining Humanity through positive experiences.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import { recalcDerived } from "../engine/character.ts";
import {
  rollHumanityGain,
  isHumanityGainOnCooldown,
  humanityGainCooldownRemaining,
  HUMANITY_GAIN_TYPES,
  type HumanityGainType,
} from "../engine/humanity.ts";
import { emitGMHumanityGained } from "../engine/emitters.ts";
import { sanitizeGMSummary } from "../engine/validation.ts";
import { bar, div, hdr, lbl, val, acc, dim, good, bad, ARR, ERR, OK, row, wrap } from "./chargen.ts";

const GAIN_LABELS: Record<HumanityGainType, string> = {
  connection:  "spending time with loved ones",
  achievement: "achieving a personal goal",
  kindness:    "an act of genuine kindness",
  memory:      "a positive human memory",
};

addCmd({
  name: "+humanity",
  pattern: /^\+humanity(?:\/(gain|status))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+humanity[/<switch>] [<type>[=<note>]]  -- Humanity regain from positive experiences.

Once per 24 hours. Amount varies by type.

Types:
  connection    Spending time with loved ones (2d6 HL recovered).
  achievement   Achieving a personal goal (1d6+2 HL recovered).
  kindness      An act of genuine kindness (1d6 HL recovered).
  memory        A positive human memory (1d3 HL recovered).

Switches:
  /gain <type>[=<note>]   Record a humanity gain event.
  /status                 Show current humanity and cooldown status.

Examples:
  +humanity/gain connection=Had dinner with my family tonight.
  +humanity/gain kindness=Helped a stranger escape from Maelstrom.
  +humanity/status`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "status").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (!sw || sw === "status") { showStatus(u, cpr);             return; }
    if (sw === "gain")          { await applyGain(u, cpr, arg);  return; }
    u.send(`${ERR}Unknown switch ${val(`"/${sw}"`)}.  Valid: /gain /status`);
  },
});

function showStatus(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const cooldownStr = isHumanityGainOnCooldown(cpr.humanityGainedAt)
    ? bad(`${Math.ceil(humanityGainCooldownRemaining(cpr.humanityGainedAt!) / 3_600_000)}h remaining`)
    : good("Available");

  const name = u.util.displayName(u.me, u.me);
  u.send([
    bar(),
    hdr(`HUMANITY: ${name}`),
    bar(),
    row("HL",       val(`${cpr.humanityLoss}`)),
    row("EMP",      `${val(cpr.stats.emp)}${dim("/")}${val(cpr.stats.empBase)}`),
    row("COOLDOWN", cooldownStr),
    div(),
    `  ${dim("Types:")}`,
    `    ${lbl("connection")}   ${dim("-- 2d6 HL, spending time with loved ones")}`,
    `    ${lbl("achievement")}  ${dim("-- 1d6+2 HL, achieving a personal goal")}`,
    `    ${lbl("kindness")}     ${dim("-- 1d6 HL, an act of genuine kindness")}`,
    `    ${lbl("memory")}       ${dim("-- 1d3 HL, a positive human memory")}`,
    bar(),
  ].join("\r\n"));
}

async function applyGain(u: IUrsamuSDK, cpr: ICPRCharacter, arg: string): Promise<void> {
  if (isHumanityGainOnCooldown(cpr.humanityGainedAt)) {
    const hoursLeft = Math.ceil(
      humanityGainCooldownRemaining(cpr.humanityGainedAt!) / 3_600_000,
    );
    u.send(`${ERR}HL regain on cooldown. Available in ${val(`${hoursLeft}h`)}.`);
    return;
  }

  const [typeRaw, note] = arg.split("=").map((s) => s.trim());
  const type = typeRaw.toLowerCase() as HumanityGainType;

  if (!HUMANITY_GAIN_TYPES.includes(type)) {
    u.send(
      `${ERR}Unknown type ${val(`"${type}"`)}.  Valid: ${HUMANITY_GAIN_TYPES.map((t) => acc(t)).join(", ")}`,
    );
    return;
  }
  if (cpr.humanityLoss === 0) {
    u.send(`${ARR}HL is already at maximum. No gain applied.`);
    return;
  }

  const gained    = rollHumanityGain(type);
  const newHL     = Math.max(0, cpr.humanityLoss - gained);
  const recalced  = recalcDerived({ ...cpr, humanityLoss: newHL });

  await u.db.modify(u.me.id, "$set", {
    "state.cpr.humanityLoss":      recalced.humanityLoss,
    "state.cpr.stats":             recalced.stats,
    "state.cpr.humanityGainedAt":  Date.now(),
  });

  const name    = u.util.displayName(u.me, u.me);
  const noteStr = note ? `  ${dim(`"${note}"`)}` : "";
  u.send([
    div(),
    `  ${OK}${val(name)} regains ${val(gained)} HL via ${GAIN_LABELS[type]}.${noteStr}`,
    row("HL",  val(`${recalced.humanityLoss}`)),
    row("EMP", `${val(recalced.stats.emp)}${dim("/")}${val(recalced.stats.empBase)}`),
    div(),
  ].join("\r\n"));
  const gmName = sanitizeGMSummary(name);
  const gmNote = note ? sanitizeGMSummary(note) : "";
  emitGMHumanityGained(
    u.me.location ?? "",
    u.me.id,
    gmName,
    sanitizeGMSummary(
      `${gmName} regains ${gained} Humanity via ${GAIN_LABELS[type]}` +
        (gmNote ? ` (${gmNote})` : "") +
        `. HL: ${recalced.humanityLoss}, EMP: ${recalced.stats.emp}/${recalced.stats.empBase}.`,
    ),
  );
}
