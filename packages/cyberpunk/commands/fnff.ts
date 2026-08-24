/**
 * +attack/called, +suppress -- FNFF Optional Combat Rules
 * CPR Core Chapter 13 -- called shots and area suppression.
 */
import { addCmd } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter } from "../db/schemas.ts";
import { resolveAttack, effectiveSP, ablateArmorState, facedownTotal } from "../engine/combat.ts";
import { rollD10Critical } from "../engine/dice.ts";
import { applyDamageToChar } from "../engine/character.ts";
import { getWeapon } from "../data/weapons.ts";
import {
  CALLED_SHOT_EFFECT,
  CALLED_SHOT_NARRATIVE,
  addLocationEffect,
  type CalledShotLocation,
} from "../engine/fnff.ts";
import { MAX_LOCATION_EFFECTS } from "../engine/validation.ts";
import { emitAttackResolved } from "../engine/emitters.ts";
import { div, lbl, val, acc, dim, bad, ylw, ARR, ERR, OK, row, tbl } from "./chargen.ts";

const rv = (n: number) => val(String(n));
const rc = (label: string, width: number) => ({ label, width, align: "right" as const });

// -- +attack/called -------------------------------------------------------------

addCmd({
  name: "+attack/called",
  pattern: /^\+attack\/called\s+(\S+)\/(\S+)(?:\s+with\s+(\S+))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+attack/called <target>/<location> [with <weapon>]  -- Called shot (FNFF).

-8 attack penalty. On hit, applies a location-specific debuff for the scene.

Locations:
  arm    Target must pass BODY DV15 or drop their weapon.
  leg    Target's MOVE is halved for the scene.
  hand   Target's affected hand is disabled for the scene.
  eye    Target takes -3 to all Awareness/Perception rolls.

Examples:
  +attack/called Rogue/arm              Called shot to Rogue's arm.
  +attack/called Rogue/leg with rifle   Called shot to leg using a rifle.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const targetName = u.util.stripSubs(u.cmd.args[0]).trim();
    const location   = u.util.stripSubs(u.cmd.args[1]).trim().toLowerCase() as CalledShotLocation;
    const weaponName = u.util.stripSubs(u.cmd.args[2] ?? "").trim();

    if (!CALLED_SHOT_EFFECT[location]) {
      u.send(`${ERR}Unknown location ${val(location)}. Valid: ${acc("arm")}, ${acc("leg")}, ${acc("hand")}, ${acc("eye")}`);
      return;
    }
    const target = await u.util.target(u.me, targetName || "", false);
    if (!target) { u.send(`${ERR}No target ${val(targetName)} found nearby.`); return; }

    const targetCpr  = target.state.cpr as ICPRCharacter | undefined;
    const weapon     = weaponName ? getWeapon(weaponName) : null;
    const defenderSP = targetCpr ? effectiveSP(targetCpr, "body") : 0;

    const result = resolveAttack({
      attackerStat:  cpr.stats.ref,
      attackerSkill: cpr.skills[weapon?.skill ?? "handgun"] ?? 0,
      aimed:         true,
      damageDice:    weapon?.damageDice ?? 2,
      defenderStat:  targetCpr?.stats.dex ?? 5,
      defenderSkill: targetCpr?.skills["evasion"] ?? 0,
    }, defenderSP);

    const atkName = u.util.displayName(u.me, u.me);
    const defName = u.util.displayName(target, u.me);

    const csResult = result.hit ? acc("HIT!") : bad("MISS");
    const lines = [
      div(),
      `  ${lbl("CALLED SHOT")}  ${val(atkName)} ${ARR}${val(defName)} / ${acc(location.toUpperCase())}`,
      ...tbl(
        [rc("ROLL", 6), rc("TOTAL", 6), rc("DEFENSE", 7), rc("RESULT", 14), rc("NET", 5)],
        [[rv(result.attackRoll), rv(result.attackTotal), rv(result.defenseTotal), csResult,
          result.hit ? rv(result.netDamage) : ""]],
      ),
      ...(result.hit ? [`  ${ARR}${dim(CALLED_SHOT_NARRATIVE[location])}`] : []),
      div(),
    ];
    const msg = lines.join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });

    if (result.hit) {
      await applyCalledShot(u, target, targetCpr, location, result.netDamage);
    }
    await emitAttackResolved({
      attackerId: u.me.id, attackerName: atkName,
      defenderId: target.id, defenderName: defName,
      hit: result.hit, roll: result.attackRoll, dv: result.defenseTotal,
      damage: result.netDamage, armorSp: defenderSP, location: "body",
      critical: result.isCritical,
    });
  },
});

async function applyCalledShot(
  u: IUrsamuSDK,
  target: IDBObj,
  targetCpr: ICPRCharacter | undefined,
  location: CalledShotLocation,
  netDamage: number,
): Promise<void> {
  if (!targetCpr) return;
  const updates: Record<string, unknown> = {};

  if (netDamage > 0) {
    const { char: updated, newWoundState } = applyDamageToChar(targetCpr, netDamage);
    updates["state.cpr.hp"]         = updated.hp;
    updates["state.cpr.woundState"] = updated.woundState;
    updates["state.cpr.armorBody"]  = ablateArmorState(targetCpr.armorBody);
    u.send([
      ...tbl(
        [rc("HP", 10), rc("STATUS", 10)],
        [[`${rv(updated.hp.current)} ${dim("/")} ${dim(String(updated.hp.max))}`, val(newWoundState.toUpperCase())]],
      ),
    ].join("\r\n"));
  }

  const existing = targetCpr.locationEffects ?? [];
  if (existing.length < MAX_LOCATION_EFFECTS) {
    updates["state.cpr.locationEffects"] = addLocationEffect(
      existing,
      CALLED_SHOT_EFFECT[location],
      u.me.id,
    );
  }
  await u.db.modify(target.id, "$set", updates);
}

// -- +suppress ------------------------------------------------------------------

addCmd({
  name: "+suppress",
  pattern: /^\+suppress\s+(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+suppress <area>  -- Declare suppressive fire over an area (FNFF).

Requires an autofire-capable weapon. Anyone attempting to move through or
act in the covered area must pass a DV15 COOL check or dive for cover.

Examples:
  +suppress the doorway           Cover the doorway with suppressive fire.
  +suppress the alley entrance    Suppress anyone approaching the alley.`,

  exec: (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const area = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!area) { u.send(`${ERR}Specify the area being suppressed: ${val("+suppress <area>")}`); return; }

    const name = u.util.displayName(u.me, u.me);
    const msg  = [
      div(),
      `  ${lbl("SUPPRESSIVE FIRE")}  ${val(name)}`,
      row("AREA", acc(area)),
      `  ${ARR}Anyone moving through or acting in that area must pass`,
      `  ${ARR}a ${val("DV15 COOL")} check or dive for cover.`,
      div(),
    ].join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });
  },
});

// -- +facedown ------------------------------------------------------------------

addCmd({
  name: "+facedown",
  pattern: /^\+facedown(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+facedown [<target>]  -- Reputation facedown: COOL + REP + 1d10.

If a target is given, the roll is contested (higher total wins).
If no target is given, just show your facedown total.

Examples:
  +facedown               Roll your facedown total.
  +facedown Maelstrom     Contested facedown vs Maelstrom.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const targetName = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const myName = u.util.displayName(u.me, u.me);
    const { base: myBase, total: myRoll } = rollD10Critical();
    const myTotal = facedownTotal(cpr.stats.cool, cpr.reputation, myRoll);

    const myLine = [
      `  ${lbl("FACEDOWN")}  ${val(myName)}`,
      row("ROLL", `${dim(`COOL(${cpr.stats.cool})`)} + ${dim(`REP(${cpr.reputation})`)} + ${dim(`d10(${myBase})`)} = ${val(myTotal)}`),
    ];

    if (!targetName) {
      u.send([div(), ...myLine, div()].join("\r\n"));
      return;
    }

    const target = await u.util.target(u.me, targetName || "", true);
    if (!target) { u.send(`${ERR}No target ${val(targetName)} found.`); return; }

    const targetCpr = target.state.cpr as ICPRCharacter | undefined;
    const defName = u.util.displayName(target, u.me);
    const { base: defBase, total: defRoll } = rollD10Critical();

    let defTotal: number;
    let defLine: string;
    if (targetCpr) {
      defTotal = facedownTotal(targetCpr.stats.cool, targetCpr.reputation, defRoll);
      defLine = row("ROLL", `${dim(`COOL(${targetCpr.stats.cool})`)} + ${dim(`REP(${targetCpr.reputation})`)} + ${dim(`d10(${defBase})`)} = ${val(defTotal)}`);
    } else {
      defTotal = defRoll;
      defLine = row("ROLL", `${dim(`d10(${defBase})`)} = ${val(defTotal)}`);
    }

    const winner = myTotal > defTotal ? myName : myTotal < defTotal ? defName : "TIE";
    const resultLine = myTotal === defTotal
      ? `  ${dim("Result:")} ${ylw("TIE")}`
      : `  ${dim("Result:")} ${OK}${val(winner)} ${dim("wins the facedown!")}`;

    const msg = [
      div(),
      `  ${lbl("FACEDOWN")}  ${val(myName)} ${ylw("vs")} ${val(defName)}`,
      div(),
      `  ${acc(myName)}`,
      ...myLine.slice(1),
      `  ${acc(defName)}`,
      defLine,
      div(),
      resultLine,
      div(),
    ].join("\r\n");

    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });
  },
});
