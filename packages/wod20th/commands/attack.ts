// commands/attack.ts -- +attack basic combat resolution (v1).
//
// Syntax: +attack[/switch] <target>
//   (none)    Brawl, Bashing damage.
//   /melee    Melee ability, Lethal damage. REQUIRES wielded melee weapon.
//   /firearms Firearms ability, Lethal damage. REQUIRES wielded firearm.
//   /claws    Brawl + 1 weapon die. Bashing in homid; Lethal in Crinos/Hispo.
//
// Logic lives in core/combat.ts; this file is glue: resolve, persist, narrate.

import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import { resolveAttack, type IAttackOptions, type IAttackResult } from "../core/combat.ts";
import { consumeAction, splitPenalty } from "../core/actions.ts";
import { applyDamage, HEALTH_TRACK_SIZE } from "../core/health.ts";
import { isIncapacitated } from "../core/wounds.ts";
import type { DamageMark } from "../core/types.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { emitHealthChanged } from "../hooks.ts";
import { wieldedWeapons, getEqMeta, type WeaponType, type DamageType } from "../core/eq.ts";
import { rollBattleScar } from "../core/battleScars.ts";
import { recordNpcKill } from "../core/npc.ts";
import { frame } from "../core/format.ts";
import { subs } from "../core/pronouns.ts";
import { findChallenge, saveChallenge } from "../db/challengeDb.ts";
import { getChallengeType } from "../splats/wta/data/challenges.ts";
import { awardRenown } from "../core/renown.ts";

type Switch = "" | "melee" | "firearms" | "claws";

/**
 * Pure helper: return the first wielded weapon on `actor` whose weaponType
 * matches, or undefined. Used by command-level guard and unit tests.
 */
// deno-lint-ignore no-explicit-any
export function pickWielded(actor: any, weaponType: WeaponType): any | undefined {
  const wielded = wieldedWeapons(actor);
  return wielded.find((it) => getEqMeta(it).weaponType === weaponType);
}

interface IBuiltOpts extends IAttackOptions {
  weaponName?: string;
  silver?: boolean;
}

function buildOpts(
  sw: Switch,
  attackerForm: string | undefined,
  // deno-lint-ignore no-explicit-any
  weapon?: any,
): IBuiltOpts {
  switch (sw) {
    case "melee": {
      const meta = weapon ? getEqMeta(weapon) : {};
      return {
        abilityName: "Melee",
        damageType: (meta.damageType ?? "L") as DamageType,
        weaponBonus: typeof meta.damage === "number" ? meta.damage : 0,
        weaponName: weapon?.name as string | undefined,
        silver: meta.silver === true,
      };
    }
    case "firearms": {
      const meta = weapon ? getEqMeta(weapon) : {};
      return {
        abilityName: "Firearms",
        damageType: (meta.damageType ?? "L") as DamageType,
        weaponBonus: typeof meta.damage === "number" ? meta.damage : 2,
        weaponName: weapon?.name as string | undefined,
        silver: meta.silver === true,
      };
    }
    case "claws": {
      // W20 Claw table (Usable By: Crinos or Hispo/A, Glabro or Lupus/B).
      // Homid is gated upstream and never reaches this branch.
      const f = (attackerForm ?? "homid").toLowerCase();
      const damageType: DamageType = (f === "crinos" || f === "hispo") ? "A" : "B";
      return { abilityName: "Brawl", damageType, weaponBonus: 1 };
    }
    default:
      return { abilityName: "Brawl", damageType: "B", weaponBonus: 0 };
  }
}

function rollSummary(label: string, r: { pool: number; netSuccesses: number; botch: boolean; dice: number[] }): string {
  const tag = r.botch ? " %crBOTCH%cn" : "";
  return `  ${label}: ${r.pool}d  ->  [${r.dice.join(", ")}]  =  ${r.netSuccesses} success${r.netSuccesses === 1 ? "" : "es"}${tag}`;
}

/**
 * Pick a varied verb + descriptor for the attack flavor line. `v1` is the
 * second-person form ("you rake talons across"), `v3` the third-person
 * agent form ("rakes talons across"). Both avoid possessive pronouns so
 * the prose reads cleanly for any gender or breed.
 */
function flavorVerb(sw: Switch, form: string | undefined): { v1: string; v3: string; descriptor: string } {
  const f = (form ?? "homid").toLowerCase();
  const warform = f === "crinos" || f === "hispo";
  // v3 uses %p (possessive adjective) so subs() can paint his/her/their.
  switch (sw) {
    case "claws":
      if (warform) {
        return { v1: "rake your talons across", v3: "rakes %p talons across", descriptor: "war-form claws" };
      }
      if (f === "lupus") {
        return { v1: "lunge, your fangs and claws snapping at", v3: "lunges, %p fangs and claws snapping at", descriptor: "lupus claws" };
      }
      return { v1: "swipe your brutish claws at", v3: "swipes %p brutish claws at", descriptor: "Glabro claws" };
    case "firearms":
      return { v1: "loose a burst at", v3: "looses a burst at", descriptor: "gunfire" };
    case "melee":
      return { v1: "carve into", v3: "carves into", descriptor: "blade" };
    default:
      return warform
        ? { v1: "slam fist and fang into", v3: "slams fist and fang into", descriptor: "war-form strike" }
        : { v1: "drive a fist into", v3: "drives a fist into", descriptor: "fist" };
  }
}

/** Tier-flavor for landed damage. Returns a short clause to append. */
function damageFlavor(dmg: number, dtype: string): string {
  if (dmg <= 0) return "";
  const heavy = dmg >= 5;
  const solid = dmg >= 3;
  const ichor = dtype === "A" ? "ichor"
              : dtype === "L" ? "blood"
              : "bruising";
  if (heavy) return `a brutal hit -- ${ichor} sprays (%cr${dmg} ${dtype}%cn)`;
  if (solid) return `a solid blow draws ${ichor} (%cr${dmg} ${dtype}%cn)`;
  return `a glancing strike (%cr${dmg} ${dtype}%cn)`;
}

/** Tier-flavor for the defender's POV when hit. */
function defenderImpact(dmg: number, dtype: string): string {
  if (dmg <= 0) return "The blow finds no purchase.";
  const heavy = dmg >= 5;
  const solid = dmg >= 3;
  if (heavy) return `%crIt savages you -- you reel under the blow. (%ch${dmg} ${dtype}%cn%cr taken)%cn`;
  if (solid) return `%crIt lands hard. (%ch${dmg} ${dtype}%cn%cr taken)%cn`;
  return `%cyA glancing hit. (%ch${dmg} ${dtype}%cn%cy taken)%cn`;
}

addCmd({
  name: "+attack",
  pattern: /^\+attack(?:\/(\S+))?\s+(.+)$/i,
  lock: "connected",
  category: "Combat",
  help: `+attack[/switch] <target>  -- Resolve a basic combat attack.

Switches:
  (none)    Brawl + Bashing.
  /melee    Melee + Lethal. Requires a wielded melee weapon.
  /firearms Firearms + Lethal. Requires a wielded firearm.
  /claws    Brawl + Lethal in Crinos/Hispo (Bashing otherwise), +1 die.

EXAMPLES
  +attack Bran        Basic brawl strike vs Bran.
  +attack/claws Bran  Claw strike (Garou).
  +attack/melee Bran  Lethal melee (must wield a melee weapon).`,

  exec: async (u: IUrsamuSDK) => {
    const rawSwitch = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const targetArg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!targetArg) { u.send("Usage: +attack[/switch] <target>"); return; }

    const sw: Switch = (["melee", "firearms", "claws"].includes(rawSwitch)
      ? rawSwitch
      : "") as Switch;

    // -- Resolve attacker character ---------------------------------------
    const attackerChar = await findByPlayer(u.me.id);
    if (!attackerChar) { u.send("You have no approved character to fight with."); return; }
    if (isIncapacitated(attackerChar)) { u.send("You are incapacitated and cannot act."); return; }

    // -- /claws gating: Homid has no claws (W20 canon, p.288 / Claw table).
    //    Glabro and Lupus can claw for Bashing; Crinos and Hispo for Agg.
    if (sw === "claws") {
      const f = (attackerChar.currentForm ?? "homid").toLowerCase();
      if (f === "homid") {
        u.send(
          "You have no claws in homid form. Shift to Glabro, Crinos, Hispo, or Lupus first.",
        );
        return;
      }
    }

    // -- Weapon gating for /melee and /firearms --------------------------
    // deno-lint-ignore no-explicit-any
    let weapon: any | undefined;
    if (sw === "melee" || sw === "firearms") {
      weapon = pickWielded(u.me, sw as WeaponType);
      if (!weapon) {
        const article = sw === "firearms" ? "a firearm" : `a ${sw} weapon`;
        u.send(`You need to wield ${article} for this attack.`);
        return;
      }
    }

    // -- Resolve target object & char -------------------------------------
    const tgtObj = await u.util.target(u.me, targetArg, true);
    if (!tgtObj) { u.send(`Target not found: ${targetArg}`); return; }
    if (tgtObj.id === u.me.id) { u.send("You cannot attack yourself."); return; }

    const defenderChar = await findByPlayer(tgtObj.id);
    if (!defenderChar) { u.send("Target has no character on file."); return; }
    if (isIncapacitated(defenderChar)) { u.send("Your target is already incapacitated."); return; }

    // -- Resolve mechanics ------------------------------------------------
    const opts: IBuiltOpts = buildOpts(sw, attackerChar.currentForm, weapon);
    opts.defenderHolder = tgtObj;
    const attPenalty = splitPenalty(attackerChar);
    opts.attackerPenalty = attPenalty;
    const result: IAttackResult = resolveAttack(attackerChar, defenderChar, opts);

    // -- Apply damage + persist -------------------------------------------
    // Save defender if damage hit OR if a declared defense was consumed.
    // Every defense roll that fires is declared now (no auto fallback).
    const consumedDefense = result.defense !== undefined;
    // Consume the attacker's action slot (no-op when no decl).
    consumeAction(attackerChar);
    await saveChar(attackerChar);
    if (consumedDefense) consumeAction(defenderChar);

    // Capture pre-damage state so we can detect transitions.
    const wasIncap = isIncapacitated(defenderChar);
    let downStatus: "unconscious" | "dying" | "dead" | null = null;
    let scarEarned: ReturnType<typeof rollBattleScar> | null = null;

    if (result.finalDamage > 0) {
      const overflow = applyDamage(defenderChar, result.damageType, result.finalDamage);
      await saveChar(defenderChar);

      // First-blood resolution for armed combat challenges
      // (single-combat / klaive-duel / death-duel). When both parties
      // have a matching pendingChallengeDuel and the strike landed
      // damage, the challenge resolves: attacker wins, victoryReward
      // applies, and the duel flag is cleared from both. death-duel
      // continues to its normal lethal resolution; single/klaive end
      // at first damage.
      const aDuel = attackerChar.pendingChallengeDuel;
      const bDuel = defenderChar.pendingChallengeDuel;
      if (aDuel && bDuel && aDuel.challengeId === bDuel.challengeId) {
        const ch = await findChallenge(aDuel.challengeId);
        if (ch && ch.status === "accepted") {
          const def = getChallengeType(ch.typeSlug);
          const isDeathDuel = ch.typeSlug === "death-duel";
          // single-combat + klaive-duel end on first damage; death-duel
          // resolves only when the attacker drops the defender.
          if (!isDeathDuel || isIncapacitated(defenderChar)) {
            ch.status = "resolved";
            ch.winnerCharId = attackerChar.id;
            ch.resolvedAt = Date.now();
            await saveChallenge(ch);
            if (def) {
              awardRenown(attackerChar, def.victoryReward.track, def.victoryReward.amount);
              await saveChar(attackerChar);
            }
            await unsetCharFields(attackerChar.id, ["pendingChallengeDuel"]);
            await unsetCharFields(defenderChar.id, ["pendingChallengeDuel"]);
            const dueName = def?.name ?? ch.typeSlug;
            u.send(`%cgFirst blood -- you win the ${dueName}! (+${def?.victoryReward.amount ?? 1} temp ${def?.victoryReward.track ?? "glory"})%cn`);
            poseRoom(u, `%cy${shiftedDisplayName(attackerChar, u.util.displayName(u.me, u.me))} draws first blood in the ${dueName}.%cn`);
          }
        }
      }

      const nowIncap = isIncapacitated(defenderChar);
      if (!wasIncap && nowIncap) {
        // Track is compacted heaviest-first; scan for the worst mark.
        const track = defenderChar.healthTrack ?? [];
        const hasA = track.includes("A");
        const hasL = track.includes("L");
        if (overflow > 0 && (result.damageType === "L" || result.damageType === "A")) {
          downStatus = "dead";
        } else if (hasA || hasL) {
          downStatus = "dying";
        } else {
          downStatus = "unconscious";
        }
        // Battle scar: survived an A strike that put a Garou down (W20 p.297).
        if (downStatus !== "dead" && defenderChar.splat === "wta" && result.damageType === "A") {
          scarEarned = rollBattleScar(undefined, opts.weaponName);
          defenderChar.scars = [...(defenderChar.scars ?? []), scarEarned];
          await saveChar(defenderChar);
        }
      }
      emitHealthChanged({
        actorId:    u.me.id,
        targetId:   tgtObj.id,
        charId:     defenderChar.id,
        action:     "hurt",
        damageType: result.damageType,
        amount:     result.finalDamage,
        track:      defenderChar.healthTrack ?? [],
      });
    } else if (consumedDefense) {
      // No damage, but the defender's slot/defense state changed.
      await saveChar(defenderChar);
    }
    // pendingDefense was cleared in-memory by resolveAttack; persist the unset.
    if (consumedDefense) {
      await unsetCharFields(defenderChar.id, ["pendingDefense"]);
    }

    // -- Emit hook --------------------------------------------------------
    gameHooks.emit("wod20th:combat:attack", {
      attackerId: u.me.id,
      defenderId: tgtObj.id,
      result,
    });

    // -- Narration --------------------------------------------------------
    const attackerName = shiftedDisplayName(attackerChar, u.util.displayName(u.me, u.me));
    const defenderName = u.util.displayName(tgtObj, u.me);
    const wname  = opts.weaponName ?? "";
    const silver = opts.silver === true;
    const silverPrefix = silver && !/\bsilver\b/i.test(wname) ? "%chsilver%cn " : "";
    const weaponClause = wname ? ` ${silverPrefix}${wname}` : "";
    const { v1, v3 } = flavorVerb(sw, attackerChar.currentForm);
    const tail = damageFlavor(result.finalDamage, result.damageType);
    const tailClause = tail ? ` -- ${tail}` : "";

    // ---- Attacker (first-person) ----
    const openLine = result.finalDamage > 0
      ? `%cyYou ${v1}${weaponClause} ${defenderName}${tailClause}.%cn`
      : `%cyYou ${v1}${weaponClause} ${defenderName}, but the strike fails to bite.%cn`;
    const lines: string[] = [openLine, rollSummary("Attack", result.attackRoll)];
    if (attPenalty > 0) lines.push(`  %cy(split penalty -${attPenalty} applied)%cn`);
    if (result.defense)   lines.push(rollSummary(`Defense (${result.defense.kind})`, result.defense.roll));
    if (result.damageRoll) lines.push(rollSummary("Damage", result.damageRoll));
    if (result.soakRoll)   lines.push(rollSummary("Soak  ", result.soakRoll));
    u.send(frame("Attack", lines));

    // ---- Defender (first-person of being hit) ----
    const dLines: string[] = [];
    if (result.defense && result.netSuccesses === 0) {
      const verb = result.defense.kind === "parry" ? "parry"
                 : result.defense.kind === "block" ? "block"
                 : "twist aside from";
      dLines.push(`%cgYou ${verb} ${attackerName}'s strike.%cn`);
    } else {
      dLines.push(subs(`%cy${attackerName} ${v3}${weaponClause} you.%cn`, attackerChar));
      dLines.push(`  ${defenderImpact(result.finalDamage, result.damageType)}`);
    }
    u.send(frame("Defend", dLines), tgtObj.id);

    // ---- Room narration (third-person, defender + observers) ----
    let roomMsg: string;
    if (result.defense && result.netSuccesses === 0) {
      const verb = result.defense.kind === "parry" ? "parries"
                 : result.defense.kind === "block" ? "blocks"
                 : "sidesteps";
      roomMsg = `%cy${attackerName} ${v3}${weaponClause} ${defenderName}, who ${verb} the strike.%cn`;
    } else if (result.defense && result.finalDamage > 0) {
      const verb = result.defense.kind === "parry" ? "parries"
                 : result.defense.kind === "block" ? "blocks"
                 : "twists aside";
      roomMsg = `%cy${attackerName} ${v3}${weaponClause} ${defenderName}, who ${verb} but takes %cr${result.finalDamage} ${result.damageType}%cn%cy.%cn`;
    } else if (result.finalDamage > 0) {
      roomMsg = `%cy${attackerName} ${v3}${weaponClause} ${defenderName}${tailClause}.%cn`;
    } else {
      roomMsg = `%cy${attackerName} ${v3}${weaponClause} ${defenderName}, but finds no purchase.%cn`;
    }
    poseRoom(u, subs(roomMsg, attackerChar));

    // -- Status-transition broadcast --------------------------------------
    if (downStatus) {
      const downPose = downStatus === "dead"
        ? `%cr${defenderName} collapses, lifeless.%cn`
        : downStatus === "dying"
          ? `%cr${defenderName} crumples in a spreading pool of blood, gravely wounded.%cn`
          : `%cy${defenderName} drops, unconscious.%cn`;
      const downSelfMsg = downStatus === "dead"
        ? "%crEverything goes black.%cn"
        : downStatus === "dying"
          ? "%crYour vision swims red; you fall, badly wounded.%cn"
          : "%cyYou black out.%cn";
      // Record NPC kill -- counter increments, titles auto-evaluate, XP trickles.
      // Loose gate: count "dying" + "dead" as a kill. Incapped is out of
      // the fight; MUSH convention treats it as the resolving blow.
      if ((downStatus === "dead" || downStatus === "dying")
          && defenderChar.isNpc && defenderChar.npcKind) {
        const result = await recordNpcKill(attackerChar, defenderChar.npcKind);
        u.send(`%cy+${result.xpAwarded.toFixed(2)} XP%cn (kill: ${defenderChar.npcKind}).`);
        for (const t of result.titles) {
          u.send(`%cgTITLE EARNED:%cn %ch${t.name}%cn  (+${t.amount} temp ${t.track})`);
          poseRoom(u, `%cy${attackerName} earns the title %ch${t.name}%cn%cy.%cn`);
        }
      }
      // Attacker channel
      u.send(downPose);
      // Defender private (only if alive enough to read it -- dead chars
      // can still get the line; the engine doesn't gate sends on status)
      u.send(downSelfMsg, tgtObj.id);
      // Room
      poseRoom(u, downPose);
      // Battle scar narration (Garou + A + survived).
      if (scarEarned) {
        const scarLine = `%cyYou bear a new battle scar: %ch${scarEarned.name}%cn%cy (+${scarEarned.glory} Glory). ${scarEarned.description}%cn`;
        u.send(scarLine, tgtObj.id);
      }
    }
  },
});
