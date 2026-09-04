/**
 * +effects -- Show ongoing ammo effects on self. Allows extinguishing burn.
 *
 * The actual tick happens from the combat turn loop (see engine/effects.ts
 * tickAmmoEffects). This command is a player-facing view + a manual snuff.
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter, IAmmoEffectState } from "../db/schemas.ts";
import { extinguishBurn, effectLabel } from "../engine/effects.ts";
import { rollD10Critical } from "../engine/dice.ts";
import {
  bar, div, hdr, row, val, acc, dim, bad, ARR, ERR, OK,
} from "./chargen.ts";

const SNUFF_DV = 13;

function fmtDuration(e: IAmmoEffectState): string {
  if (e.remainingTurns < 0) return dim("ongoing");
  return val(`${e.remainingTurns} rd${e.remainingTurns === 1 ? "" : "s"}`);
}

function fmtRow(e: IAmmoEffectState): string {
  const dmg = e.damagePerTurn && e.damagePerTurn > 0
    ? bad(`${e.damagePerTurn}/turn`)
    : dim("--");
  return row(effectLabel(e), `${dmg}  ${fmtDuration(e)}`);
}

addCmd({
  name: "+effects",
  pattern: /^\+effects(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+effects[/switch]  -- View ongoing ammo effects on yourself.

Switches:
  /snuff     Spend an action to put yourself out (DV13 Athletics).

Examples:
  +effects         Show all ongoing burn / poison / EMP / sleep effects.
  +effects/snuff   Roll Athletics vs. DV13 to extinguish burning.`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    if (sw === "snuff") { await snuffBurn(u, cpr); return; }
    if (sw && sw !== "list") {
      u.send(`${ERR}Unknown switch ${val("/" + sw)}.`); return;
    }
    showEffects(u, cpr);
  },
});

function showEffects(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const active = cpr.activeAmmoEffects ?? [];
  const lines: string[] = [bar(), hdr("ONGOING EFFECTS"), bar()];
  if (active.length === 0) {
    lines.push(`  ${dim("No active ammo effects.")}`);
  } else {
    for (const e of active) lines.push(fmtRow(e));
    if (active.some((e) => e.effect === "burn")) {
      lines.push(div());
      lines.push(`  ${ARR}${val("+effects/snuff")}  ${dim("-- DV13 Athletics to extinguish")}`);
    }
  }
  lines.push(bar());
  u.send(lines.join("\r\n"));
}

async function snuffBurn(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const active = cpr.activeAmmoEffects ?? [];
  if (!active.some((e) => e.effect === "burn")) {
    u.send(`${ERR}You are not on fire.`); return;
  }
  const dex = cpr.stats.dex;
  const athletics = cpr.skills.athletics ?? 0;
  const { total: roll } = rollD10Critical();
  const total = dex + athletics + roll;
  if (total < SNUFF_DV) {
    u.send(`${ERR}Snuff failed: ${val(total)} vs DV${val(SNUFF_DV)}.  ${bad("Still burning!")}`);
    return;
  }
  const next = extinguishBurn(active);
  await u.db.modify(u.me.id, "$set", { "state.cpr.activeAmmoEffects": next });
  u.send(`${OK}You pat out the flames. ${val(total)} vs DV${val(SNUFF_DV)} -- ${acc("EXTINGUISHED")}.`);
}
