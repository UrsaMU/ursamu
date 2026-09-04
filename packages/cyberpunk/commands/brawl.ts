/**
 * +brawl -- Unarmed Combat Special Moves (FNFF)
 * CPR Core Chapter 13 -- grappling and brawling special actions.
 */
import { addCmd } from "@ursamu/mush";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import { applyDamageToChar } from "../engine/character.ts";
import {
  resolveBrawlOpposed,
  resolveBrawlDV,
  addLocationEffect,
  hasLocationEffect,
  type ILocationEffect,
} from "../engine/fnff.ts";
import { MAX_LOCATION_EFFECTS, sanitizeGMSummary } from "../engine/validation.ts";
import { emitGMBrawlResolved } from "../engine/emitters.ts";
import { div, lbl, val, acc, dim, bad, ARR, ERR, tbl } from "./chargen.ts";

const rv = (n: number) => val(String(n));
const rc = (label: string, width: number) => ({ label, width, align: "right" as const });

type BrawlMove = "grab" | "throw" | "disarm" | "pin" | "choke";

addCmd({
  name: "+brawl",
  pattern: /^\+brawl\/(grab|throw|disarm|pin|choke)\s+(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+brawl/<move> <target>  -- Unarmed combat special moves (FNFF).

Moves:
  /grab    DEX+Brawling vs DEX+Evasion. Grabbed target cannot move freely.
  /throw   DEX+Brawling vs DV15. Deals 2d6 body damage, target is prone.
  /disarm  DEX+Brawling vs DEX+weapon skill. Knocks weapon from target's hand.
  /pin     Requires grab. DEX+Brawling vs DEX+Brawling. Target is immobilized.
  /choke   Requires grab. BODY+Brawling vs DV15. 1d6 per round; KO at 0 HP.

Examples:
  +brawl/grab Rogue     Attempt to grab Rogue.
  +brawl/pin Rogue      Pin a grabbed Rogue to the ground.
  +brawl/choke Rogue    Choke a grabbed Rogue (requires grab first).`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const move       = u.cmd.args[0].toLowerCase() as BrawlMove;
    const targetName = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    if (!targetName) { u.send(`${ERR}Specify a target: ${val("+brawl/<move> <target>")}`); return; }

    const target = await u.util.target(u.me, targetName || "", false);
    if (!target) { u.send(`${ERR}No target ${val(targetName)} found nearby.`); return; }

    const targetCpr = target.state.cpr as ICPRCharacter | undefined;
    const atkName   = u.util.displayName(u.me, u.me);
    const defName   = u.util.displayName(target, u.me);
    const brawl     = cpr.skills["brawling"] ?? 0;

    const executed = await doBrawlMove(u, cpr, target, targetCpr, move, brawl, atkName, defName);
    // H-5: only emit if the move was actually attempted (pin/choke skip emit on pre-condition failure)
    if (executed) {
      const gmAtk = sanitizeGMSummary(atkName);
      const gmDef = sanitizeGMSummary(defName);
      emitGMBrawlResolved(
        u.me.location ?? "",
        u.me.id,
        gmAtk,
        sanitizeGMSummary(`${gmAtk} attempts ${move} on ${gmDef}.`),
      );
    }
  },
});

// deno-lint-ignore require-await
async function doBrawlMove(
  u: IUrsamuSDK,
  cpr: ICPRCharacter,
  target: IDBObj,
  targetCpr: ICPRCharacter | undefined,
  move: BrawlMove,
  brawl: number,
  atkName: string,
  defName: string,
): Promise<boolean> {
  // Returns true if the move was executed (or attempted), false if rejected
  // by a pre-condition check (e.g. pin/choke when target is not grabbed).
  switch (move) {
    case "grab":   return doGrab(u, cpr, target, targetCpr, brawl, atkName, defName);
    case "throw":  return doThrow(u, cpr, target, targetCpr, brawl, atkName, defName);
    case "disarm": return doDisarm(u, cpr, target, targetCpr, brawl, atkName, defName);
    case "pin":    return doPin(u, cpr, target, targetCpr, brawl, atkName, defName);
    case "choke":  return doChoke(u, cpr, target, targetCpr, brawl, atkName, defName);
  }
}

async function doGrab(u: IUrsamuSDK, cpr: ICPRCharacter, target: IDBObj, targetCpr: ICPRCharacter | undefined, brawl: number, atkName: string, defName: string): Promise<boolean> {
  const r = resolveBrawlOpposed(cpr.stats.dex, brawl, targetCpr?.stats.dex ?? 5, targetCpr?.skills["evasion"] ?? 0);
  const grabResult = r.success ? acc("GRABBED!") : bad("MISS");
  if (r.success) {
    const existing = targetCpr?.locationEffects ?? [];
    if (existing.length >= MAX_LOCATION_EFFECTS) {
      u.send(`${ERR}${val(defName)} already has the maximum number of active location effects.`);
      return true;
    }
    const effects = addLocationEffect(existing, "grabbed", u.me.id);
    await u.db.modify(target.id, "$set", { "state.cpr.locationEffects": effects });
  }
  const msg = [
    div(),
    `  ${lbl("GRAB")}  ${val(atkName)} ${ARR}${val(defName)}`,
    ...tbl(
      [rc("ATK", 6), rc("DEF", 6), rc("RESULT", 22)],
      [[rv(r.atkTotal), rv(r.defTotal), r.success ? `${grabResult}  ${dim("cannot move freely")}` : grabResult]],
    ),
    div(),
  ].join("\r\n");
  u.send(msg);
  u.here.broadcast?.(msg, { exclude: [u.me.id] });
  return true;
}

async function doThrow(u: IUrsamuSDK, cpr: ICPRCharacter, target: IDBObj, targetCpr: ICPRCharacter | undefined, brawl: number, atkName: string, defName: string): Promise<boolean> {
  const r = resolveBrawlDV(cpr.stats.dex, brawl, 15);
  const throwDmg = cpr.stats.body;
  let newWoundState = "";
  if (r.success && targetCpr) {
    const { char: updated, newWoundState: ws } = applyDamageToChar(targetCpr, throwDmg);
    newWoundState = ws;
    await u.db.modify(target.id, "$set", {
      "state.cpr.hp":         updated.hp,
      "state.cpr.woundState": updated.woundState,
    });
  }
  const throwResult = r.success ? `${acc("HIT!")}  ${dim("PRONE")}` : bad("MISS");
  const msg = [
    div(),
    `  ${lbl("THROW")}  ${val(atkName)} ${ARR}${val(defName)}`,
    ...tbl(
      [rc("ATK", 6), rc("DV", 4), rc("RESULT", 14), rc("DMG", 5), rc("STATUS", 10)],
      [[rv(r.atkTotal), val("15"), throwResult,
        r.success ? `${rv(throwDmg)} ${dim("(no SP)")}` : "",
        r.success && newWoundState ? val(newWoundState.toUpperCase()) : ""]],
    ),
    div(),
  ].join("\r\n");
  u.send(msg);
  u.here.broadcast?.(msg, { exclude: [u.me.id] });
  return true;
}

// deno-lint-ignore require-await
async function doDisarm(u: IUrsamuSDK, cpr: ICPRCharacter, target: IDBObj, targetCpr: ICPRCharacter | undefined, brawl: number, atkName: string, defName: string): Promise<boolean> {
  const WEAPON_SKILLS = ["handgun", "shoulder_arms", "melee_weapon", "brawling"];
  const defWeaponSkill = targetCpr
    ? Math.max(0, ...WEAPON_SKILLS.map((s) => targetCpr.skills[s] ?? 0))
    : 0;
  const r = resolveBrawlOpposed(cpr.stats.dex, brawl, targetCpr?.stats.dex ?? 5, defWeaponSkill);
  const disarmResult = r.success ? acc("DISARMED!") : bad("MISS");
  const msg = [
    div(),
    `  ${lbl("DISARM")}  ${val(atkName)} ${ARR}${val(defName)}`,
    ...tbl(
      [rc("ATK", 6), rc("DEF", 6), rc("RESULT", 14)],
      [[rv(r.atkTotal), rv(r.defTotal), disarmResult]],
    ),
    div(),
  ].join("\r\n");
  u.send(msg);
  u.here.broadcast?.(msg, { exclude: [u.me.id] });
  return true;
}

async function doPin(u: IUrsamuSDK, cpr: ICPRCharacter, target: IDBObj, targetCpr: ICPRCharacter | undefined, brawl: number, atkName: string, defName: string): Promise<boolean> {
  if (!targetCpr || !hasLocationEffect(targetCpr, "grabbed")) {
    u.send(`${ERR}${val(defName)} is not grabbed. Use ${val("+brawl/grab")} first.`);
    return false; // H-5: pre-condition not met -- tell caller not to emit
  }
  const r = resolveBrawlOpposed(cpr.stats.dex, brawl, targetCpr.stats.dex, targetCpr.skills["brawling"] ?? 0);
  const pinResult = r.success ? acc("PINNED!") : bad("MISS");
  if (r.success) {
    const existing = targetCpr.locationEffects ?? [];
    if (existing.length >= MAX_LOCATION_EFFECTS) {
      u.send(`${ERR}${val(defName)} already has the maximum number of active location effects.`);
      return true;
    }
    const effects = addLocationEffect(existing, "pinned", u.me.id);
    await u.db.modify(target.id, "$set", { "state.cpr.locationEffects": effects });
  }
  const msg = [
    div(),
    `  ${lbl("PIN")}  ${val(atkName)} ${ARR}${val(defName)}`,
    ...tbl(
      [rc("ATK", 6), rc("DEF", 6), rc("RESULT", 22)],
      [[rv(r.atkTotal), rv(r.defTotal), r.success ? `${pinResult}  ${dim("fully immobilized")}` : pinResult]],
    ),
    div(),
  ].join("\r\n");
  u.send(msg);
  u.here.broadcast?.(msg, { exclude: [u.me.id] });
  return true;
}

async function doChoke(u: IUrsamuSDK, cpr: ICPRCharacter, target: IDBObj, targetCpr: ICPRCharacter | undefined, brawl: number, atkName: string, defName: string): Promise<boolean> {
  if (!targetCpr || !hasLocationEffect(targetCpr, "grabbed")) {
    u.send(`${ERR}${val(defName)} is not grabbed. Use ${val("+brawl/grab")} first.`);
    return false; // H-5: pre-condition not met -- tell caller not to emit
  }
  const r = resolveBrawlDV(cpr.stats.body, brawl, 15);
  const chokeDmg = cpr.stats.body;

  if (r.success) {
    const prevChokeCount = (target.state.cpr as Record<string, unknown>)?.chokeCount as number ?? 0;
    const chokeCount = prevChokeCount + 1;
    const { char: updated, newWoundState: derivedWound } = applyDamageToChar(targetCpr, chokeDmg);
    const forceKO = chokeCount >= 3;
    const newWoundState = forceKO ? "mortally" : derivedWound;
    const finalChar = forceKO ? { ...updated, woundState: "mortally" as const } : updated;
    await u.db.modify(target.id, "$set", {
      "state.cpr.hp":         finalChar.hp,
      "state.cpr.woundState": finalChar.woundState,
      "state.cpr.chokeCount": forceKO ? 0 : chokeCount,
    });
    const chokeResult = forceKO ? acc("KO!") : acc("CHOKING!");
    const msg = [
      div(),
      `  ${lbl("CHOKE")}  ${val(atkName)} ${ARR}${val(defName)}`,
      ...tbl(
        [rc("ATK", 6), rc("DV", 4), rc("RESULT", 10), rc("DMG", 5), rc("CHOKE", 7), rc("STATUS", 10)],
        [[rv(r.atkTotal), val("15"), chokeResult, `${rv(chokeDmg)} ${dim("(no SP)")}`,
          `${val(String(chokeCount))}${dim("/3")}`, val(newWoundState.toUpperCase())]],
      ),
      div(),
    ].join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });
  } else {
    await u.db.modify(target.id, "$set", { "state.cpr.chokeCount": 0 });
    const msg = [
      div(),
      `  ${lbl("CHOKE")}  ${val(atkName)} ${ARR}${val(defName)}`,
      ...tbl(
        [rc("ATK", 6), rc("DV", 4), rc("RESULT", 10)],
        [[rv(r.atkTotal), val("15"), bad("MISS")]],
      ),
      div(),
    ].join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });
  }
  return true;
}
