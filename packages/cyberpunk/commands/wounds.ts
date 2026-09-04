/**
 * +wound, +deathsave, +stabilize, +heal -- Wound and Death Save Commands
 */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { ICPRCharacter } from "../db/schemas.ts";
import { rollD10Critical } from "../engine/dice.ts";
import { applyDamageToChar, applyHealingToChar, totalDeathSavePenalty } from "../engine/character.ts";
import { MAX_CRIT_INJURIES, canSelfStabilize, canReceiveHealing } from "../engine/validation.ts";
import { getCritEntry, buildCritInjury } from "../data/critical-injuries.ts";
import { emitCombatWound, emitDeathSave, emitStabilized } from "../engine/emitters.ts";
import { bar, div, hdr, lbl, val, acc, dim, bad, ERR, OK, row } from "./chargen.ts";

addCmd({
  name: "+wound",
  pattern: /^\+wound\s+(\S+)\s+(\d+)(?:\s+(head|body))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+wound <target> <damage> [head|body]  -- Apply damage to a character.

Automatically calculates net damage after SP, updates HP and wound state.
Defaults to body location if omitted.

Examples:
  +wound Rogue 15          Apply 15 damage to Rogue (body).
  +wound Rogue 10 head     Apply 10 damage to Rogue's head.`,

  exec: async (u: IUrsamuSDK) => {
    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
    if (!isAdmin) { u.send(`${ERR}Only admins can apply wounds directly.`); return; }

    const targetName = u.util.stripSubs(u.cmd.args[0]).trim();
    const damage = parseInt(u.cmd.args[1], 10);
    const location = ((u.cmd.args[2] ?? "body").toLowerCase()) as "head" | "body";

    const target = await u.util.target(u.me, targetName || "", true);
    if (!target) { u.send(`${ERR}Target not found.`); return; }

    const cpr = target.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}${u.util.displayName(target, u.me)} has no character sheet.`); return; }

    if (isNaN(damage) || damage < 0) { u.send(`${ERR}Damage must be a non-negative number.`); return; }

    const { char: updated, newWoundState } = applyDamageToChar(cpr, damage);
    await u.db.modify(target.id, "$set", {
      "state.cpr.hp": updated.hp,
      "state.cpr.woundState": updated.woundState,
    });

    const name = u.util.displayName(target, u.me);
    u.send([
      div(),
      `  ${lbl("WOUND APPLIED")}`,
      row("TARGET",   val(name)),
      row("LOCATION", acc(location.toUpperCase())),
      row("DAMAGE",   val(String(damage))),
      row("HP",       `${val(String(updated.hp.current))} / ${dim(String(updated.hp.max))}`),
      row("STATUS",   val(newWoundState.toUpperCase())),
      div(),
    ].join("\r\n"));
    u.send([
      `  ${ERR}You take ${val(String(damage))} damage! (${location})`,
      row("HP",     `${val(String(updated.hp.current))} / ${dim(String(updated.hp.max))}`),
      row("STATUS", val(newWoundState.toUpperCase())),
    ].join("\r\n"), target.id);
    await emitCombatWound({
      actorId: target.id,
      actorName: name,
      from: cpr.woundState,
      to: newWoundState,
      hp: updated.hp.current,
      maxHp: updated.hp.max,
    });
  },
});

addCmd({
  name: "+crit",
  pattern: /^\+crit(?:\s+(head|body))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+crit [head|body]  -- Roll a critical injury on yourself.

Roll 2d6 on the critical injury table for the given location.
Use when your attack causes 2+ natural 6s on damage dice.

Examples:
  +crit        Roll body critical injury.
  +crit head   Roll head critical injury.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const location = ((u.cmd.args[0] ?? "body").toLowerCase()) as "head" | "body";
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const roll = die1 + die2;

    const entry = getCritEntry(location, roll);
    if (!entry) { u.send(`${ERR}No critical injury entry for roll ${roll}.`); return; }

    if (cpr.criticalInjuries.length >= MAX_CRIT_INJURIES) {
      u.send(`${ERR}Cannot add more than ${MAX_CRIT_INJURIES} critical injuries.`);
      return;
    }
    const injury = buildCritInjury(location, roll);
    const updatedInjuries = [...cpr.criticalInjuries, injury];

    await u.db.modify(u.me.id, "$set", { "state.cpr.criticalInjuries": updatedInjuries });

    const name = u.util.displayName(u.me, u.me);
    const lines = [
      bar(),
      hdr("CRITICAL INJURY"),
      bar(),
      row("MEAT",     val(name)),
      row("LOCATION", acc(location.toUpperCase())),
      row("ROLL",     val(`${die1} + ${die2} = ${roll}`)),
      row("INJURY",   val(injury.name)),
      div(),
      ...injury.effects.split(/\r?\n/).map((l) => `  ${dim(l)}`),
    ];
    if (injury.deathSavePenalty > 0) {
      lines.push(`  ${ERR}Death Save Penalty: ${acc(`-${injury.deathSavePenalty}`)}`);
    }
    lines.push(bar());
    u.send(lines.join("\r\n"));
    u.here.broadcast?.(`${ERR}${acc("[CRITICAL INJURY]")} ${val(name)}: ${val(injury.name)}`);
  },
});

addCmd({
  name: "+deathsave",
  pattern: /^\+deathsave$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+deathsave  -- Make a Death Save roll when mortally wounded.

Roll 1d10. Must roll <= (BODY - penalties) to survive.
Make this roll at the start of each of your turns while mortally wounded.
A failed Death Save means your character dies.

Examples:
  +deathsave      Roll to survive this round.
  +deathsave      Roll again if still mortally wounded next round.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }
    if (cpr.woundState !== "mortally") { u.send(`${ERR}You are not mortally wounded.`); return; }

    const penalty = totalDeathSavePenalty(cpr);
    const threshold = cpr.deathSave - penalty;
    const { base: roll } = rollD10Critical();

    const survived = roll <= threshold;
    const name = u.util.displayName(u.me, u.me);

    const resultLine = survived
      ? `  ${OK}${acc("SURVIVED!")}  Flatline averted -- for now.`
      : `  ${ERR}${bad("DEAD.")}  ${dim("The line goes flat.")}`;

    if (!survived) {
      await u.db.modify(u.me.id, "$set", { "state.cpr.woundState": "dead" });
    }

    const lines = [
      bar(),
      hdr("DEATH SAVE"),
      bar(),
      row("MEAT",      val(name)),
      row("ROLL",      val(String(roll))),
      row("THRESHOLD", `${val(String(threshold))}  ${dim(`(BODY:${cpr.deathSave} - penalty:${penalty})`)}`),
      div(),
      resultLine,
      bar(),
    ];
    const msg = lines.join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });
    await emitDeathSave({
      actorId: u.me.id,
      actorName: name,
      roll,
      body: cpr.deathSave,
      penalty,
      success: survived,
    });
  },
});

addCmd({
  name: "+stabilize",
  pattern: /^\+stabilize\s+(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+stabilize <target>  -- Attempt to stabilize a mortally wounded character.

Requires First Aid or Paramedic skill. Roll vs DV15 (First Aid) or DV13 (Paramedic).
Success stops death saves for 1 hour.

Examples:
  +stabilize Rogue    Attempt to stabilize Rogue.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const targetName = u.util.stripSubs(u.cmd.args[0]).trim();
    const target = await u.util.target(u.me, targetName || "", false);
    if (!target) { u.send(`${ERR}Target not found nearby.`); return; }

    if (!canSelfStabilize(u.me.id, target.id)) {
      u.send(`${ERR}You cannot stabilize yourself. (CPR core rules, p. 227)`);
      return;
    }

    const targetCpr = target.state.cpr as ICPRCharacter | undefined;
    if (!targetCpr?.chargenComplete) { u.send(`${ERR}${u.util.displayName(target, u.me)} has no character sheet.`); return; }
    if (targetCpr.woundState !== "mortally") { u.send(`${ERR}${u.util.displayName(target, u.me)} is not mortally wounded.`); return; }

    const hasParamedic = (cpr.skills["paramedic"] ?? 0) > 0;
    const skillName = hasParamedic ? "paramedic" : "first_aid";
    const skillVal = cpr.skills[skillName] ?? 0;
    const dv = hasParamedic ? 13 : 15;

    const { base: roll, total: rollTotal } = rollD10Critical();
    const total = cpr.stats.tech + skillVal + rollTotal;
    const success = total >= dv;

    const healer = u.util.displayName(u.me, u.me);
    const patient = u.util.displayName(target, u.me);

    const resultLine = success
      ? `  ${OK}${acc("STABILIZED!")}  Death saves halted.`
      : `  ${ERR}Failed. The meat keeps bleeding.`;

    if (success) {
      await emitStabilized(
        target.id,
        patient,
        u.me.id,
        healer,
      );
    }

    const lines = [
      div(),
      `  ${lbl("STABILIZE")}  ${val(healer)} -> ${val(patient)}`,
      row("SKILL", acc(skillName.replace("_", " "))),
      row("ROLL",  val(String(total))),
      row("DV",    val(String(dv))),
      div(),
      resultLine,
      div(),
    ];
    const msg = lines.join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });
  },
});

addCmd({
  name: "+firstaid",
  pattern: /^\+firstaid(?:\s+(.*))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+firstaid [<target>]  -- Attempt to heal a nearby character with First Aid or Paramedic.

Roll TECH + First Aid (DV 15) or TECH + Paramedic (DV 13) — Paramedic preferred if skill > 0.
On success, restore 1d6 HP to the target. Cannot use on yourself.

Examples:
  +firstaid Rogue    Attempt to patch up Rogue.
  +firstaid          With no target, displays usage hint.`,

  exec: async (u: IUrsamuSDK) => {
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character found.`); return; }

    const targetName = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    if (!targetName) { u.send(`${ERR}Usage: +firstaid <target>`); return; }

    const target = await u.util.target(u.me, targetName || "", false);
    if (!target) { u.send(`${ERR}Target not found nearby.`); return; }

    if (!canSelfStabilize(u.me.id, target.id)) {
      u.send(`${ERR}You cannot administer First Aid to yourself. (CPR core rules, p. 227)`);
      return;
    }

    const targetCpr = target.state.cpr as ICPRCharacter | undefined;
    if (!targetCpr?.chargenComplete) { u.send(`${ERR}${u.util.displayName(target, u.me)} has no character sheet.`); return; }

    if (!canReceiveHealing(targetCpr)) {
      u.send(`${ERR}${u.util.displayName(target, u.me)} is flatlined. First aid does not work on dead characters.`);
      return;
    }

    const hasParamedic = (cpr.skills["paramedic"] ?? 0) > 0;
    const skillName = hasParamedic ? "paramedic" : "first_aid";
    const skillVal = cpr.skills[skillName] ?? 0;
    const dv = hasParamedic ? 13 : 15;

    const { base: _roll, total: rollTotal } = rollD10Critical();
    const total = cpr.stats.tech + skillVal + rollTotal;
    const success = total >= dv;

    const healer = u.util.displayName(u.me, u.me);
    const patient = u.util.displayName(target, u.me);

    let resultLine: string;
    if (success) {
      const heal = Math.floor(Math.random() * 6) + 1;
      const { newHp, newWoundState } = applyHealingToChar(targetCpr, heal);
      await u.db.modify(target.id, "$set", {
        "state.cpr.hp.current": newHp,
        "state.cpr.woundState": newWoundState,
      });
      resultLine = `  ${OK}${acc("SUCCESS!")}  ${val(String(heal))} HP restored.  ${dim(`(${newWoundState.toUpperCase()})`)}`;
      u.send([
        `  ${OK}${val(healer)} patches you up -- ${val(String(heal))} HP restored.`,
        row("HP",     `${val(String(newHp))} / ${dim(String(targetCpr.hp.max))}`),
        row("STATUS", val(newWoundState.toUpperCase())),
      ].join("\r\n"), target.id);
    } else {
      resultLine = `  ${ERR}Failed. The wound won't close.`;
    }

    const lines = [
      div(),
      `  ${lbl("FIRST AID")}  ${val(healer)} -> ${val(patient)}`,
      row("SKILL", acc(skillName.replace("_", " "))),
      row("ROLL",  val(String(total))),
      row("DV",    val(String(dv))),
      div(),
      resultLine,
      div(),
    ];
    const msg = lines.join("\r\n");
    u.send(msg);
    u.here.broadcast?.(msg, { exclude: [u.me.id] });
  },
});

addCmd({
  name: "+heal",
  pattern: /^\+heal(?:\s+(\S+))?\s*(\d+)?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+heal [<target>] [<amount>]  -- Apply healing to self or target.

Without amount, heals 1 HP (bandaging). With amount, heals specified HP.
Requires admin to heal others for large amounts.

Examples:
  +heal          Heal 1 HP on yourself.
  +heal 5        Heal 5 HP on yourself.
  +heal Rogue 10 Heal Rogue for 10 HP.`,

  exec: async (u: IUrsamuSDK) => {
    const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard");
    const rawArg0 = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const rawArg1 = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // Figure out if arg0 is a number (self-heal) or a name
    const arg0IsNum = /^\d+$/.test(rawArg0);
    const targetName = arg0IsNum ? "" : rawArg0;
    const amountStr = arg0IsNum ? rawArg0 : rawArg1;
    const amount = parseInt(amountStr || "1", 10);

    const target = targetName
      ? await u.util.target(u.me, targetName || "", isAdmin)
      : u.me;
    if (!target) { u.send(`${ERR}Target not found.`); return; }

    if (target.id !== u.me.id && !isAdmin) { u.send(`${ERR}Only admins can heal others directly.`); return; }

    const cpr = target.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No character sheet found.`); return; }
    if (isNaN(amount) || amount < 1) { u.send(`${ERR}Amount must be a positive number.`); return; }

    if (!canReceiveHealing(cpr)) {
      u.send(`${ERR}${u.util.displayName(target, u.me)} is flatlined. Cannot heal a dead character.`);
      return;
    }

    const { newHp, newWoundState } = applyHealingToChar(cpr, amount);
    await u.db.modify(target.id, "$set", { "state.cpr.hp.current": newHp, "state.cpr.woundState": newWoundState });

    const name = u.util.displayName(target, u.me);
    u.send([
      `  ${OK}${val(name)} patched up -- ${val(String(amount))} HP restored.`,
      row("HP",     `${val(String(newHp))} / ${dim(String(cpr.hp.max))}`),
      row("STATUS", val(newWoundState.toUpperCase())),
    ].join("\r\n"));
    if (target.id !== u.me.id) {
      u.send([
        `  ${OK}${val(u.util.displayName(u.me, target))} patches you up -- ${val(String(amount))} HP.`,
        row("HP",     `${val(String(newHp))} / ${dim(String(cpr.hp.max))}`),
        row("STATUS", val(newWoundState.toUpperCase())),
      ].join("\r\n"), target.id);
    }
  },
});

const STIM_COOLDOWN_MS = 86_400_000; // 24 hours

addCmd({
  name: "+stim",
  pattern: /^\+stim(?:\s+(.+))?$/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+stim [<target>]  -- Administer a Speedheal pharmaceutical for 10 HP.

Can be used on yourself or another player. Only one stim may be used per
character per 24-hour period.

Examples:
  +stim           Use a stim on yourself.
  +stim Rogue     Use a stim on Rogue.`,

  exec: async (u: IUrsamuSDK) => {
    const targetArg = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const target = targetArg
      ? await u.util.target(u.me, targetArg, true)
      : u.me;
    if (!target) { u.send(`${ERR}Target not found.`); return; }

    const cpr = target.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send(`${ERR}No active character sheet found.`); return; }

    if (!canReceiveHealing(cpr)) {
      const name = u.util.displayName(target, u.me);
      u.send(`${ERR}${val(name)} is flatlined. Stims do not work on dead characters.`);
      return;
    }

    const lastUsed = (cpr as ICPRCharacter & { stimLastUsed?: number }).stimLastUsed ?? 0;
    const elapsed = Date.now() - lastUsed;
    if (elapsed < STIM_COOLDOWN_MS) {
      const remaining = STIM_COOLDOWN_MS - elapsed;
      const hrs  = Math.floor(remaining / 3_600_000);
      const mins = Math.floor((remaining % 3_600_000) / 60_000);
      const name = u.util.displayName(target, u.me);
      u.send(`${ERR}${val(name)} has already used a stim. Available again in ${val(String(hrs))}h ${val(String(mins))}m.`);
      return;
    }

    const { newHp, newWoundState } = applyHealingToChar(cpr, 10);
    await u.db.modify(target.id, "$set", {
      "state.cpr.hp.current": newHp,
      "state.cpr.woundState": newWoundState,
      "state.cpr.stimLastUsed": Date.now(),
    });

    const name = u.util.displayName(target, u.me);
    u.send([
      `  ${OK}${val(name)} slams a Speedheal -- ${val("10")} HP restored.`,
      row("HP",     `${val(String(newHp))} / ${dim(String(cpr.hp.max))}`),
      row("STATUS", val(newWoundState.toUpperCase())),
    ].join("\r\n"));
    if (target.id !== u.me.id) {
      u.send([
        `  ${OK}${val(u.util.displayName(u.me, target))} jabs you with a Speedheal -- ${val("10")} HP.`,
        row("HP",     `${val(String(newHp))} / ${dim(String(cpr.hp.max))}`),
        row("STATUS", val(newWoundState.toUpperCase())),
      ].join("\r\n"), target.id);
    }
  },
});
