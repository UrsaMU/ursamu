/**
 * +init, +attack, +pass, +hold -- Combat Tracker and Attack Resolution
 */
import { addCmd, DBO } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type {
  ICPRCharacter,
  ICPRNpc,
  ICombatState,
  ICombatActor,
  ICPRSuppression,
} from "../db/schemas.ts";
import { rollD10Critical, rollDamage } from "../engine/dice.ts";
import { resolveAttack, resolveAutofire, effectiveSP, ablateArmorState, sortInitiative, advanceTurn, isImpressedBy, IMPRESSED_ATTACK_PENALTY } from "../engine/combat.ts";
import { autofireClass, autofireDV, parseRangeBand, RANGE_BAND_LABELS, AUTOFIRE_SV_CAP, type RangeBand } from "../engine/combat-autofire.ts";
import { CALLED_SHOT_EFFECT, CALLED_SHOT_NARRATIVE, addLocationEffect, type CalledShotLocation } from "../engine/fnff.ts";
import { MAX_LOCATION_EFFECTS } from "../engine/validation.ts";
import { applyDamageToChar, woundActionPenalty } from "../engine/character.ts";
import { applyStunDamage } from "../engine/stun.ts";
import { enqueueAmmoEffect, tickAmmoEffects, rollResistSave } from "../engine/effects.ts";
import { checkSmartgunLink } from "../engine/smartgun.ts";
import { applyDamageToNpc } from "../engine/npc.ts";
import { getWeapon } from "../data/weapons.ts";
import { defaultAmmoForWeaponType, type AmmoType } from "../data/ammo.ts";
import { emitCombatStart, emitAttackResolved, emitCombatWound, emitGMAttackHit } from "../engine/emitters.ts";
import { sanitizeGMSummary } from "../engine/validation.ts";
import { bar, div, hdr, lbl, val, acc, dim, bad, ARR, ERR, OK, row, tbl } from "./chargen.ts";
import {
  applyEncounterToCombat,
  ensureEncounterParticipant,
  markEncounterOut,
  syncEncounterFromCombat,
} from "../src/combat/sync.ts";
import {
  endEncounterFight,
  joinRoomNpcsToCombat,
  roomBroadcast,
  walkIfNpc,
} from "../src/combat/session.ts";
import { currentActor } from "@ursamu/combat";

const combatDB = new DBO<ICombatState>("cpr.combat");
const suppressDB = new DBO<ICPRSuppression>("cpr.suppression");

/**
 * Save combat → sync encounter → walk NPCs → write turn/round
 * back to legacy so the next PC action continues correctly.
 */
async function persistAndWalk(
  u: IUrsamuSDK,
  combat: ICombatState,
): Promise<ICombatState> {
  let next = await joinRoomNpcsToCombat(u, combat);
  // Only sort when new NPCs joined — preserve turn index otherwise
  if (next.queue.length !== combat.queue.length) {
    const curId = next.queue[next.currentIndex]?.actorId;
    const sorted = sortInitiative(next.queue);
    let currentIndex = curId
      ? sorted.findIndex((a) => a.actorId === curId)
      : next.currentIndex;
    if (currentIndex < 0) currentIndex = 0;
    next = { ...next, queue: sorted, currentIndex };
  }
  await combatDB.update({ id: next.id }, next);

  let enc = await syncEncounterFromCombat(next);
  enc = (await walkIfNpc(u, enc)) ?? enc;

  // Walker advanced turnIdx/round — pull back into legacy
  next = applyEncounterToCombat(next, enc);
  await combatDB.update({ id: next.id }, next);

  const cur = currentActor(enc);
  if (cur && enc.status === "active") {
    roomBroadcast(
      u,
      `${acc(`Round ${next.round}`)} — ` +
        `${val(cur.name)}'s turn` +
        (cur.kind === "npc" ? dim(" [AI]") : "") +
        ".",
    );
  }
  return next;
}

/** Mark PC acted, advance legacy queue, walk NPCs. */
async function finishPcTurn(
  u: IUrsamuSDK,
  roomId: string,
): Promise<void> {
  const combat = (await combatDB.find({
    roomId,
    active: true,
  }))[0];
  if (!combat) return;
  // Prefer advancing from the actor who just acted (may not
  // match currentIndex if desynced).
  let idx = combat.queue.findIndex(
    (a) => a.actorId === u.me.id,
  );
  if (idx < 0) return;
  // If this PC is not the current actor, still allow if they
  // were current before desync — snap currentIndex to them.
  const fromIdx = idx;
  combat.queue[fromIdx] = {
    ...combat.queue[fromIdx],
    acted: true,
  };
  const { nextIndex, newRound } = advanceTurn(
    combat.queue,
    fromIdx,
  );
  let next: ICombatState = {
    ...combat,
    queue: combat.queue,
    currentIndex: nextIndex,
  };
  if (newRound) {
    next = {
      ...next,
      round: (combat.round ?? 1) + 1,
      queue: combat.queue.map((a) => ({
        ...a,
        acted: false,
      })),
    };
  }
  await persistAndWalk(u, next);
}

// -- +init ---------------------------------------------------------------------

addCmd({
  name: "+init",
  pattern: /^\+init(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+init [<modifier>]  -- Roll initiative and join combat tracker.

If no combat is active in the room, starts a new one.
Run again after all combatants roll to see the order.

Examples:
  +init       Roll REF + 1d10 for initiative.
  +init +2    Roll with a +2 modifier.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const mod = parseInt(u.util.stripSubs(u.cmd.args[0] ?? "0"), 10) || 0;
    const { total: d10 } = rollD10Critical();
    const woundPen = woundActionPenalty(cpr.woundState, cpr.cyberware);
    const hasKerenzikov = cpr.cyberware.some((cw) => cw.name === "kerenzikov");
    const kereBonus = hasKerenzikov ? 2 : 0;
    const hasSandevistanActive = cpr.sandevistanActive === true &&
      cpr.cyberware.some((cw) => cw.name === "sandevistan_speedware");
    const sandyBonus = hasSandevistanActive ? 3 : 0;
    const initTotal = cpr.stats.ref + d10 + mod + woundPen + kereBonus + sandyBonus;

    const roomId = u.me.location ?? "";
    let combat = (await combatDB.find({ roomId, active: true }))[0];

    const actor: ICombatActor = {
      actorId: u.me.id,
      name: u.util.displayName(u.me, u.me),
      initiative: initTotal,
      held: false,
      acted: false,
      isNpc: false,
    };

    if (!combat) {
      combat = {
        id: crypto.randomUUID(),
        roomId,
        round: 1,
        active: true,
        queue: [actor],
        currentIndex: 0,
        startedAt: Date.now(),
        startedBy: u.me.id,
        log: [`Round 1 started by ${actor.name}`],
      };
      // Pull street NPCs into the queue with their own init rolls
      combat = await joinRoomNpcsToCombat(u, combat);
      combat = { ...combat, queue: sortInitiative(combat.queue) };
      await combatDB.create(combat);
      await emitCombatStart(combat.roomId, combat.startedBy, combat.queue.map((a) => ({ actorId: a.actorId, name: a.name })));
      const initBreakdown = [
        `REF:${cpr.stats.ref}`,
        `d10:${d10}`,
        ...(mod ? [`mod:${mod}`] : []),
        ...(woundPen ? [`wound:${woundPen}`] : []),
        ...(kereBonus ? [`Kere:+${kereBonus}`] : []),
        ...(sandyBonus ? [`Sandy:+${sandyBonus}`] : []),
      ].join(" + ");
      u.send([
        bar(),
        hdr("COMBAT INITIATED"),
        bar(),
        `  ${lbl("COMBATANT")} ${val(actor.name)}`,
        `  ${lbl("INITIATIVE")} ${val(String(initTotal))}  ${dim(`(${initBreakdown})`)}`,
        `  ${dim(`${combat.queue.length} in queue (NPCs auto-join)`)}`,
        bar(),
      ].join("\r\n"));
    } else {
      const idx = combat.queue.findIndex((a) => a.actorId === u.me.id);
      if (idx >= 0) {
        combat.queue[idx] = actor;
        combat = await joinRoomNpcsToCombat(u, combat);
        combat = { ...combat, queue: sortInitiative(combat.queue) };
        await combatDB.update({ id: combat.id }, combat);
        u.send(`${OK}Initiative updated to ${val(String(initTotal))}.`);
      } else {
        combat.queue.push(actor);
        combat = await joinRoomNpcsToCombat(u, combat);
        combat = { ...combat, queue: sortInitiative(combat.queue) };
        await combatDB.update({ id: combat.id }, combat);
        u.send(`${OK}${val(actor.name)} joins combat -- initiative ${val(String(initTotal))}.`);
      }
    }

    u.here.broadcast?.(`${actor.name} rolls initiative: ${val(String(initTotal))}`);

    // Clear sandevistan active flag after the roll consumes the bonus
    if (hasSandevistanActive) {
      await u.db.modify(u.me.id, "$set", { "state.cpr.sandevistanActive": false });
    }

    // Mirror + let leading NPCs act immediately
    const live = (await combatDB.find({ roomId, active: true }))[0] ??
      combat;
    await persistAndWalk(u, live);
  },
});

// -- +attack -------------------------------------------------------------------

addCmd({
  name: "+attack",
  pattern: /^\+attack(?:\/(aimed|auto|melee|called))?\s+(.*?)(?:\s+with\s+(\S+))?(?:\s+at\s+(\S+))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+attack[/<mode>] <target>[/<loc>] [with <weapon>] [at <range>]

Modes:
  /aimed   Aimed shot: -8 to hit, +1 damage on hit. Single/semi-auto only.
  /auto    Autofire burst (SMG / Assault Rifle). 2d6 x margin (cap 4).
  /melee   Melee: uses DEX + Melee Weapon.
  /called  Called shot to a body location (-8 to hit). Locations:
           head (x2 damage after armor), arm, leg, hand, eye.

Ranges (autofire only): close, medium, long, vlong, extreme.

Examples:
  +attack Rogue                       Default-weapon attack.
  +attack/aimed Rogue with pistol     Aimed shot with a pistol.
  +attack/auto Rogue with smg at medium  Autofire SMG at 7-12m.
  +attack/called Rogue/head with rifle   Head shot (-8, x2 damage).`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const roomIdAtk = u.me.location ?? "";
    await ensureEncounterParticipant(roomIdAtk, {
      actorId: u.me.id,
      name: u.util.displayName(u.me, u.me),
      kind: "pc",
    });

    const mode = (u.cmd.args[0] ?? "").toLowerCase();
    const rawTarget = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const weaponName = u.util.stripSubs(u.cmd.args[2] ?? "").trim();
    const rangeArg = u.util.stripSubs(u.cmd.args[3] ?? "").trim();

    // /called accepts "target/loc"; split it out
    let targetName = rawTarget;
    let calledLoc: CalledShotLocation | "head" | null = null;
    if (mode === "called") {
      const slash = rawTarget.lastIndexOf("/");
      if (slash < 0) {
        u.send(`${ERR}Called shot needs a location: ${val("+attack/called <target>/<head|arm|leg|hand|eye>")}`);
        return;
      }
      targetName = rawTarget.slice(0, slash).trim();
      const locStr = rawTarget.slice(slash + 1).trim().toLowerCase();
      if (!["head", "arm", "leg", "hand", "eye"].includes(locStr)) {
        u.send(`${ERR}Bad called-shot location: ${val(locStr)}.  Try head, arm, leg, hand, or eye.`);
        return;
      }
      calledLoc = locStr as CalledShotLocation | "head";
    }

    if (!targetName) { u.send(`${ERR}Specify a target: ${val("+attack <name>")}`); return; }

    const target = await u.util.target(u.me, targetName || "", false);
    if (!target) { u.send(`${ERR}No target ${val(targetName)} found nearby.`); return; }

    const targetCpr = target.state.cpr as ICPRCharacter | undefined;
    const targetNpc = target.state.cprNpc as ICPRNpc | undefined;
    await ensureEncounterParticipant(roomIdAtk, {
      actorId: target.id,
      name: u.util.displayName(target, u.me),
      kind: targetNpc ? "npc" : "pc",
    });

    // Weapon stats
    const weapon = weaponName ? getWeapon(weaponName) : null;
    const damageDice = weapon?.damageDice ?? 2;
    const atkName = u.util.displayName(u.me, u.me);
    const defName = u.util.displayName(target, u.me);

    const rv = (n: number) => val(String(n));
    const rc = (label: string, width: number) => ({ label, width, align: "right" as const });

    // -- Autofire mode (errata p.173 -- DV by weapon class + range) -----------
    if (mode === "auto") {
      if (!weapon?.autofire) {
        u.send(`${ERR}${val(weapon?.name ?? "That weapon")} cannot use Autofire.`);
        return;
      }
      const cls = autofireClass(weapon.type);
      if (!cls) {
        u.send(`${ERR}${val(weapon.name)} has no autofire DV table (must be SMG or Assault Rifle).`);
        return;
      }
      const band: RangeBand = rangeArg ? (parseRangeBand(rangeArg) ?? "close") : "close";
      if (rangeArg && !parseRangeBand(rangeArg)) {
        u.send(`${ERR}Bad range ${val(rangeArg)}. Use close, medium, long, vlong, or extreme.`);
        return;
      }
      const dv = autofireDV(cls, band);
      const autofireMax = weapon.autofireMax ?? AUTOFIRE_SV_CAP;
      const autofireSkill = cpr.skills.autofire ?? 0;
      const defenderSP = targetCpr
        ? effectiveSP(targetCpr, "body")
        : (targetNpc?.armorBody?.currentSp ?? 0);

      const af = resolveAutofire(
        cpr.stats.ref,
        autofireSkill,
        dv,
        defenderSP,
        autofireMax,
      );

      const hit = af.hit && af.sv > 0;
      const afResult = !af.hit ? bad("MISS") : af.sv === 0 ? bad("SV 0") : acc("HIT!");

      const lines = [
        div(),
        `  ${lbl("AUTOFIRE")}  ${val(atkName)} ${ARR}${val(defName)}  ${dim(`[${cls}/${RANGE_BAND_LABELS[band]} cap:${autofireMax}]`)}`,
        ...tbl(
          [rc("ROLL", 6), rc("DV", 4), rc("MARGIN", 7), rc("SV", 4), rc("RESULT", 12), rc("RAW", 6), rc("SP", 5), rc("NET", 5)],
          [[rv(af.attackTotal), rv(af.defenseTotal), rv(Math.max(0, af.attackTotal - af.defenseTotal)), rv(af.sv), afResult,
            hit ? rv(af.totalDamage) : "", hit ? rv(defenderSP) : "", hit ? rv(af.netDamage) : ""]],
        ),
        div(),
      ];
      const msg = lines.join("\r\n");
      u.send(msg);
      u.here.broadcast?.(msg, { exclude: [u.me.id] });

      if (af.hit && af.sv > 0 && targetCpr && af.netDamage > 0) {
        const { char: updatedTarget, newWoundState } = applyDamageToChar(targetCpr, af.netDamage);
        const updatedArmor = ablateArmorState(targetCpr.armorBody);
        await u.db.modify(target.id, "$set", {
          "state.cpr.hp": updatedTarget.hp,
          "state.cpr.woundState": updatedTarget.woundState,
          "state.cpr.armorBody": updatedArmor,
        });
        await emitCombatWound({ actorId: target.id, actorName: defName, from: targetCpr.woundState, to: newWoundState, hp: updatedTarget.hp.current, maxHp: updatedTarget.hp.max });
        if (newWoundState === "mortally" || newWoundState === "dead" ||
          updatedTarget.hp.current <= 0) {
          await markEncounterOut(roomIdAtk, target.id);
        }
        u.send(`  ${lbl(defName)} ${val(newWoundState.toUpperCase())}  ${dim(`HP: ${updatedTarget.hp.current}/${updatedTarget.hp.max}`)}`);
      }
      await finishPcTurn(u, roomIdAtk);
      return;
    }

    // -- Standard / Aimed / Melee / Called attack ----------------------------
    const isBrawl = weapon?.skill === "brawling" || (!weapon && mode !== "melee");
    const isMelee = mode === "melee" || weapon?.skill?.includes("melee") || weapon?.skill === "brawling";
    const halveSP = isMelee && !isBrawl;

    // Aimed shot: only allowed with weapons that can make aimed shots
    // (i.e. single-shot / semi-auto). Autofire-only weapons cannot aim.
    if (mode === "aimed" && weapon && weapon.aimed !== true) {
      u.send(`${ERR}${val(weapon.name)} cannot make aimed shots (single/semi-auto only).`);
      return;
    }

    const isHeadShot = mode === "called" && calledLoc === "head";
    const attackStat = isMelee ? cpr.stats.dex : cpr.stats.ref;
    const skillName = isMelee ? "melee_weapon" : (weapon?.skill ?? "handgun");
    const attackSkill = cpr.skills[skillName] ?? 0;

    // Head shots use head armor SP; otherwise body armor.
    const npcHeadSp = (target.state.cprNpc as ICPRNpc | undefined)?.armorHead?.currentSp ?? 0;
    const defenderSP = isHeadShot
      ? (targetCpr ? effectiveSP(targetCpr, "head", halveSP) : npcHeadSp)
      : (targetCpr ? effectiveSP(targetCpr, "body", halveSP)
                   : (targetNpc?.armorBody?.currentSp ?? 0));
    const defenderDex = targetCpr?.stats?.dex ?? targetNpc?.stats?.dex ?? 5;
    const defenderEvasion = targetCpr?.skills?.evasion ?? targetNpc?.skills?.evasion ?? 0;

    // Targeting Scope: +1 to aimed shot rolls (cyberoptic)
    const hasTargetingScope = cpr.cyberware.some((cw) => cw.name === "targeting_scope");
    const targetingScopeBonus = (mode === "aimed" && hasTargetingScope) ? 1 : 0;

    const requestedAmmo: AmmoType = (weapon
      ? (cpr.ammoLoaded?.[weapon.name] as AmmoType | undefined)
        ?? defaultAmmoForWeaponType(weapon.type)
      : "basic");
    const sg = checkSmartgunLink(cpr, requestedAmmo);
    const ammoType: AmmoType = sg.fallbackAmmo ?? requestedAmmo;
    if (sg.reason) u.send(`  ${dim(sg.reason)}`);

    const impressed = isImpressedBy(cpr, target.id);
    const impressedPenalty = impressed ? IMPRESSED_ATTACK_PENALTY : 0;
    if (impressed) u.send(`  ${dim(`[Impressed by ${defName}: ${IMPRESSED_ATTACK_PENALTY} to attack]`)}`);

    const result = resolveAttack({
      attackerStat: attackStat,
      attackerSkill: attackSkill + targetingScopeBonus + sg.penalty + impressedPenalty,
      aimed: mode === "aimed",
      calledShot: mode === "called",
      location: isHeadShot ? "head" : "body",
      damageDice,
      meleeBody: isMelee ? cpr.stats.body : undefined,
      defenderStat: defenderDex,
      defenderSkill: defenderEvasion,
      ammoType,
    }, defenderSP);

    const atkResult = result.hit
      ? result.blockedByArmor ? `${acc("HIT!")} ${bad("[BLOCKED]")}`
        : result.isCritical ? `${acc("HIT!")} ${bad("[CRIT!]")}` : acc("HIT!")
      : bad("MISS");
    const ammoTag = result.ammoType !== "basic" ? `  ${dim(`[${result.ammoType.toUpperCase()}]`)}` : "";

    const lines = [
      div(),
      `  ${lbl("ATTACK")}  ${val(atkName)} ${ARR}${val(defName)}${mode ? `  ${dim(`[${mode.toUpperCase()}]`)}` : ""}${ammoTag}${targetingScopeBonus ? `  ${dim("[Scope:+1]")}` : ""}`,
      ...tbl(
        [rc("ROLL", 6), rc("TOTAL", 6), rc("DEFENSE", 7), rc("RESULT", 14), rc("RAW", 6), rc("SP", 5), rc("NET", 5)],
        [[rv(result.attackRoll), rv(result.attackTotal), rv(result.defenseTotal), atkResult,
          result.hit ? rv(result.rawDamage) : "", result.hit ? rv(defenderSP) : "", result.hit ? rv(result.netDamage) : ""]],
      ),
      div(),
    ];
    const msg = lines.join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });

    // Called-shot location effect (arm / leg / hand / eye) -- applied on any hit
    if (result.hit && mode === "called" && calledLoc && calledLoc !== "head" && targetCpr) {
      const effectType = CALLED_SHOT_EFFECT[calledLoc as CalledShotLocation];
      const existing = targetCpr.locationEffects ?? [];
      if (existing.length < MAX_LOCATION_EFFECTS) {
        const effects = addLocationEffect(existing, effectType, u.me.id);
        await u.db.modify(target.id, "$set", { "state.cpr.locationEffects": effects });
        u.send(`  ${ARR}${dim(CALLED_SHOT_NARRATIVE[calledLoc as CalledShotLocation])}`);
      }
    }

    if (result.hit && targetCpr && result.netDamage > 0) {
      if (result.nonLethal) {
        const { char: updatedTarget, knockedOut } = applyStunDamage(targetCpr, result.netDamage);
        await u.db.modify(target.id, "$set", { "state.cpr.stun": updatedTarget.stun });
        u.send(`  ${lbl(defName)} ${val(`STUN: ${updatedTarget.stun?.current}/${updatedTarget.stun?.max}`)}${knockedOut ? `  ${bad("[KO]")}` : ""}`);
      } else {
        const { char: updatedTarget, newWoundState } = applyDamageToChar(targetCpr, result.netDamage);
        const updatedArmor = ablateArmorState(targetCpr.armorBody);
        await u.db.modify(target.id, "$set", {
          "state.cpr.hp": updatedTarget.hp,
          "state.cpr.woundState": updatedTarget.woundState,
          "state.cpr.armorBody": updatedArmor,
        });
        await emitCombatWound({ actorId: target.id, actorName: defName, from: targetCpr.woundState, to: newWoundState, hp: updatedTarget.hp.current, maxHp: updatedTarget.hp.max });
        if (newWoundState === "mortally" || newWoundState === "dead" ||
          updatedTarget.hp.current <= 0) {
          await markEncounterOut(roomIdAtk, target.id);
        }
        u.send([
          `  ${lbl(defName)} ${val(newWoundState.toUpperCase())}  ${dim(`HP: ${updatedTarget.hp.current}/${updatedTarget.hp.max}`)}`,
        ].join("\r\n"));
        const gmAtk = sanitizeGMSummary(atkName);
        const gmDef = sanitizeGMSummary(defName);
        emitGMAttackHit(
          u.me.location ?? "",
          u.me.id,
          gmAtk,
          sanitizeGMSummary(
            `${gmAtk} hits ${gmDef} -- ${result.netDamage} net damage` +
              (result.isCritical ? ", critical injury possible" : "") +
              `. ${gmDef} is now ${newWoundState.toUpperCase()} ` +
              `(HP: ${updatedTarget.hp.current}/${updatedTarget.hp.max}).`,
          ),
        );
      }
    }

    if (result.hit && targetCpr && result.ammoEffects.length > 0) {
      let effState = targetCpr.activeAmmoEffects ?? [];
      for (const eff of result.ammoEffects) {
        if (eff.effect === "stun" || eff.effect === "smoke") continue;
        const needsSave = eff.effect === "poison" || eff.effect === "sleep" || eff.effect === "biotoxin";
        const savedRoll = needsSave
          ? rollResistSave(targetCpr.stats.will, targetCpr.skills["resist_torture_drugs"] ?? 0).total
          : undefined;
        effState = enqueueAmmoEffect(effState, eff, savedRoll, u.me.id);
      }
      if (effState !== (targetCpr.activeAmmoEffects ?? [])) {
        await u.db.modify(target.id, "$set", { "state.cpr.activeAmmoEffects": effState });
      }
    }
    await emitAttackResolved({ attackerId: u.me.id, attackerName: atkName, defenderId: target.id, defenderName: defName, hit: result.hit, roll: result.attackTotal, dv: result.defenseTotal, damage: result.netDamage, armorSp: defenderSP, location: "body", critical: result.isCritical });

    // End PC turn → NPCs act via @ursamu/combat walker
    await finishPcTurn(u, roomIdAtk);
  },
});

// -- +pass / +hold -------------------------------------------------------------

addCmd({
  name: "+pass",
  pattern: /^\+pass$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+pass  -- Pass your turn in combat.

Marks your action as taken and advances to the next combatant.
NPC turns resolve automatically via base combat AI.

Examples:
  +pass    Skip your action this round.`,
  exec: async (u: IUrsamuSDK) => {
    const combat = (await combatDB.find({ roomId: u.me.location ?? "", active: true }))[0];
    if (!combat) { u.send(`${ERR}No active combat in this room.`); return; }
    const idx = combat.queue.findIndex((a) => a.actorId === u.me.id);
    if (idx < 0) { u.send(`${ERR}You are not in the initiative queue.`); return; }
    combat.queue[idx] = { ...combat.queue[idx], acted: true };

    const meCpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (meCpr?.activeAmmoEffects?.length) {
      const { damage, remaining } = tickAmmoEffects(meCpr);
      const patch: Record<string, unknown> = { "state.cpr.activeAmmoEffects": remaining };
      if (damage > 0) {
        const { char: ticked, newWoundState } = applyDamageToChar(meCpr, damage);
        patch["state.cpr.hp"] = ticked.hp;
        patch["state.cpr.woundState"] = ticked.woundState;
        u.send(`  ${bad(`${damage} ongoing damage`)}  ${val(`HP: ${ticked.hp.current}/${ticked.hp.max}`)}  ${dim(newWoundState.toUpperCase())}`);
      }
      await u.db.modify(u.me.id, "$set", patch);
    }

    const { nextIndex, newRound } = advanceTurn(combat.queue, combat.currentIndex);
    let next: ICombatState = {
      ...combat,
      queue: combat.queue,
      currentIndex: nextIndex,
    };
    if (newRound) {
      next = {
        ...next,
        round: combat.round + 1,
        queue: combat.queue.map((a) => ({ ...a, acted: false })),
      };
    }
    const nextActor = next.queue[next.currentIndex];
    const roundLine = newRound
      ? `  ${acc(`-- ROUND ${next.round} --`)}`
      : "";
    u.send(
      `${OK}${val(u.util.displayName(u.me, u.me))} passes.` +
        `${roundLine}  ${ARR}Next: ${val(nextActor?.name ?? "?")}`,
    );
    u.here.broadcast?.(
      `${u.util.displayName(u.me, u.me)} passes. Next: ` +
        `${val(nextActor?.name ?? "?")}`,
    );
    await persistAndWalk(u, next);
  },
});

addCmd({
  name: "+combat",
  pattern: /^\+combat(?:\/(end|queue|log|resist))?\s*(.*)?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+combat[/switch]  -- View or manage the combat tracker.

Switches:
  /queue   Show initiative order.
  /log     Show combat log.
  /end     End combat (initiator or admin).
  /resist  Roll REF + Evasion vs active suppressive fire in this room.

Examples:
  +combat           Show current queue.
  +combat/end       End the current combat.
  +combat/resist    Roll to resist suppressive fire.`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase();
    const combat = (await combatDB.find({ roomId: u.me.location ?? "", active: true }))[0];

    // /resist is independent of active combat
    if (sw === "resist") {
      const suppression = (await suppressDB.find({ roomId: u.me.location ?? "", active: true }))[0];
      if (!suppression) { u.send(`${ERR}No active suppressive fire in this room.`); return; }
      const cpr = u.me.state.cpr as ICPRCharacter | undefined;
      if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

      const { total: resistRoll } = rollD10Critical();
      const resistTotal = cpr.stats.ref + (cpr.skills.evasion ?? 0) + resistRoll;
      const success = resistTotal > suppression.suppressTotal;

      const lines = [
        div(),
        hdr("SUPPRESSIVE FIRE RESIST"),
        `  ${lbl("ATTACKER")} ${val(suppression.attackerName)}  ${lbl("SUPPRESS")} ${val(String(suppression.suppressTotal))}`,
        row("YOUR ROLL", val(String(resistTotal))),
        success
          ? `  ${OK}${acc("SUCCESS")} — you evade suppressive fire.`
          : `  ${ERR}${bad("FAILED")} — caught in the open!`,
        div(),
      ];
      const msg = lines.join("\r\n");
      u.send(msg);

      if (!success) {
        // 1d6 damage, bypass armor (CPR Core p.196)
        const dmg = rollDamage(1);
        const dmgVal = dmg.total;
        const updatedHp = { ...cpr.hp, current: Math.max(0, cpr.hp.current - dmgVal) };
        await u.db.modify(u.me.id, "$set", { "state.cpr.hp": updatedHp });
        u.send(`  ${ERR}${val(u.util.displayName(u.me, u.me))} takes ${val(String(dmgVal))} damage from suppressive fire ${dim("(armor bypassed)")}.  ${dim(`HP: ${updatedHp.current}/${updatedHp.max}`)}`);
        u.here.broadcast?.(`${u.util.displayName(u.me, u.me)} is caught in suppressive fire and takes ${dmgVal} damage!`);
      }
      return;
    }

    if (!combat && sw !== "end") { u.send(`${ERR}No active combat in this room.`); return; }
    if (!combat) { u.send(`${ERR}No active combat.`); return; }

    if (!sw || sw === "queue") {
      const lines = [
        bar(),
        hdr(`ROUND ${combat.round} -- INITIATIVE ORDER`),
        bar(),
      ];
      combat.queue.forEach((a, i) => {
        const marker = i === combat.currentIndex ? `${acc("->")}`  : "  ";
        const tags = [
          a.acted ? dim("[acted]") : "",
          a.held ? acc("[held]") : "",
        ].filter(Boolean).join(" ");
        lines.push(`  ${marker} ${val(String(a.initiative).padStart(3))}  ${a.name}${tags ? `  ${tags}` : ""}`);
      });
      lines.push(bar());
      u.send(lines.join("\r\n")); return;
    }

    if (sw === "log") {
      const lines = [
        bar(),
        hdr("COMBAT LOG"),
        bar(),
        ...combat.log.slice(-20).map((l) => `  ${dim(l)}`),
        bar(),
      ];
      u.send(lines.join("\r\n")); return;
    }

    if (sw === "end") {
      const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
      if (combat.startedBy !== u.me.id && !isAdmin) { u.send(`${ERR}Only the initiator or an admin can end combat.`); return; }
      await combatDB.update({ id: combat.id }, { ...combat, active: false });
      await endEncounterFight(u, u.me.location ?? "");
      const msg = `${OK}${acc("Combat ended.")}`;
      u.send(msg);
      u.here.broadcast?.(msg, { exclude: [u.me.id] });
    }
  },
});

// -- +suppress -----------------------------------------------------------------

addCmd({
  name: "+suppress",
  pattern: /^\+suppress(?:\s+(\S+))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+suppress [with <weapon>]  -- Lay down suppressive fire on this room.

Declare a 25m × 3m suppressed area (CPR Core p.196). Burns 10 bullets.
Anyone in the room can roll +combat/resist to check if they are caught.
Attacker rolls WILL + Concentration + 1d10 to set the suppression total.

Examples:
  +suppress                    Suppress with default weapon.
  +suppress with assault_rifle Suppress with a specific weapon.`,
  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const weaponName = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const weapon = weaponName ? getWeapon(weaponName) : null;

    if (weaponName && !weapon) {
      u.send(`${ERR}Weapon ${val(weaponName)} not found.`);
      return;
    }
    if (weapon && !weapon.autofire) {
      u.send(`${ERR}${val(weapon.name)} cannot perform suppressive fire (requires autofire capability).`);
      return;
    }

    // Deactivate any prior suppression by this attacker in this room
    const existing = (await suppressDB.find({ roomId: u.me.location ?? "", attackerId: u.me.id, active: true }))[0];
    if (existing) {
      await suppressDB.update({ id: existing.id }, { ...existing, active: false });
    }

    const { total: supRoll } = rollD10Critical();
    const suppressTotal = cpr.stats.will + (cpr.skills.concentration ?? 0) + supRoll;

    const record: ICPRSuppression = {
      id: crypto.randomUUID(),
      roomId: u.me.location ?? "",
      attackerId: u.me.id,
      attackerName: u.util.displayName(u.me, u.me),
      suppressTotal,
      damageDice: weapon?.damageDice ?? 2,
      createdAt: Date.now(),
      active: true,
    };
    await suppressDB.create(record);

    const atkName = u.util.displayName(u.me, u.me);
    const lines = [
      div(),
      hdr("SUPPRESSIVE FIRE"),
      `  ${lbl("ATTACKER")} ${val(atkName)}${weapon ? `  ${lbl("WEAPON")} ${val(weapon.name)}` : ""}`,
      row("WILL + CONC + d10", val(String(suppressTotal))),
      `  ${acc("Area is now suppressed.")} Use ${val("+combat/resist")} to check if caught.`,
      div(),
    ];
    const msg = lines.join("\r\n");
    u.send(msg);
    u.here.broadcast?.(`${atkName} lays down suppressive fire! (Total: ${suppressTotal}) Use +combat/resist if in the area.`);
  },
});
