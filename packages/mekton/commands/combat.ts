import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";
import { chars } from "../schema.ts";
import type { IMektonChar, WoundLocation } from "../schema.ts";
import { applyDamage, combatStatus, LOCATION_LABELS, resolveAttack, emitCombatEvent } from "../combat.ts";
import { findGearByName } from "../catalog.ts";
import { derivedStats, maxWounds } from "../derived.ts";
import { rollInterlock } from "../roll.ts";

const VALID_LOCATIONS = Object.keys(LOCATION_LABELS) as WoundLocation[];

function parseLocation(raw: string): WoundLocation | null {
  const map: Record<string, WoundLocation> = {
    head: "head", torso: "torso",
    rarm: "rArm", "r.arm": "rArm", "right arm": "rArm",
    larm: "lArm", "l.arm": "lArm", "left arm": "lArm",
    rleg: "rLeg", "r.leg": "rLeg", "right leg": "rLeg",
    lleg: "lLeg", "l.leg": "lLeg", "left leg": "lLeg",
  };
  return map[raw.toLowerCase().trim()] ?? null;
}

addCmd({
  name: "+attack",
  pattern: /^\+attack(?:\/(manual))?\s+(.+)=(.+)/i,
  lock: "connected",
  category: "Combat",
  help: `+attack <target>=<weapon>          — Resolve a full attack (auto-roll both sides).
+attack/manual <target>=<hits>/<location>  — Apply hits directly (staff override).

Examples:
  +attack Zylith=Combat Pistol          Full attack roll vs Zylith.
  +attack/manual Zylith=5/torso         Apply 5 hits to Zylith's torso.`,
  exec: async (u: IUrsamuSDK) => {
    const sw         = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const targetName = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const rest       = u.util.stripSubs(u.cmd.args[2] ?? "").trim();

    const target = await u.util.target(u.me, targetName, true);
    if (!target) { u.send(`Target "${targetName}" not found.`); return; }

    const attChar = await chars.findOne({ playerId: u.me.id });
    if (!attChar) { u.send("No character found."); return; }

    if (sw === "manual") {
      const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      if (!isAdmin) { u.send("Permission denied."); return; }
      const parts = rest.split("/");
      const hits = parseInt(parts[0], 10);
      const loc = parseLocation(parts[1] ?? "torso");
      if (isNaN(hits) || !loc) { u.send("Usage: +attack/manual <target>=<hits>/<location>"); return; }

      const defChar = await chars.findOne({ playerId: target.id });
      if (!defChar) { u.send(`${target.name} has no character.`); return; }
      const wounds = { ...defChar.wounds };
      const applied = applyDamage(wounds, loc, hits);
      await chars.update({ id: defChar.id }, { wounds });
      u.send(`Applied %cy${applied}%cn damage to ${target.name}'s ${LOCATION_LABELS[loc]}. Status: ${combatStatus({ ...defChar, wounds })}`);
      return;
    }

    // Full attack
    const weaponName = rest;
    const weapon = findGearByName(weaponName) ?? attChar.equipment.find((e) => e.name.toLowerCase() === weaponName.toLowerCase());
    if (!weapon || !weapon.damage) { u.send(`"${weaponName}" not found or has no damage stat. Use a weapon name from your inventory.`); return; }

    const defChar = await chars.findOne({ playerId: target.id });
    if (!defChar) { u.send(`${target.name} has no character record.`); return; }

    const skillName = weapon.category === "melee" ? "Blade" : "Handgun";
    const attackSkill = attChar.skills[skillName] ?? 0;

    const event = resolveAttack(attChar, defChar, weapon, attackSkill);
    event.roomId = u.me.location ?? u.me.id;

    if (event.hit && event.appliedDamage !== undefined) {
      const loc = Object.keys(LOCATION_LABELS).find(
        (k) => LOCATION_LABELS[k as WoundLocation] === event.location,
      ) as WoundLocation | undefined;
      if (loc) {
        const wounds = { ...defChar.wounds };
        applyDamage(wounds, loc, event.appliedDamage);

        // Stun check
        const derived = derivedStats(defChar);
        const stunRoll = Math.ceil(Math.random() * 10);
        const stunned = event.appliedDamage > 0 && stunRoll > derived.stun;
        await chars.update({ id: defChar.id }, { wounds, stunned: stunned || defChar.stunned });
        event.stunCheck = stunned;
        if (stunned) event.summary += ` ${defChar.playerName} is STUNNED.`;
      }
    }

    u.send(event.summary);
    if (event.hit) u.send(event.summary, target.id);
    emitCombatEvent(event);
  },
});

addCmd({
  name: "+damage",
  pattern: /^\+damage(?:\s+(.+)\/)?\s*(.+)=(\d+)/i,
  lock: "connected",
  category: "Combat",
  help: `+damage <location>=<hits>               — Apply damage to yourself.
+damage <player>/<location>=<hits>        — Apply damage to another (admin).

Examples:
  +damage torso=6         Take 6 hits to torso.
  +damage Alice/head=4    Apply 4 hits to Alice's head (admin).`,
  exec: async (u: IUrsamuSDK) => {
    const playerArg = u.cmd.args[0] ?? null;
    const locRaw    = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const hits      = parseInt(u.cmd.args[2] ?? "0", 10);

    let charRecord: IMektonChar | null;
    if (playerArg) {
      const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      if (!isAdmin) { u.send("Permission denied."); return; }
      const target = await u.util.target(u.me, u.util.stripSubs(playerArg).trim(), true);
      if (!target) { u.send("Target not found."); return; }
      charRecord = await chars.findOne({ playerId: target.id });
    } else {
      charRecord = await chars.findOne({ playerId: u.me.id });
    }
    if (!charRecord) { u.send("No character found."); return; }

    const loc = parseLocation(locRaw);
    if (!loc) { u.send(`Unknown location "${locRaw}". Valid: ${VALID_LOCATIONS.join(", ")}.`); return; }

    const wounds = { ...charRecord.wounds };
    const applied = applyDamage(wounds, loc, hits);
    await chars.update({ id: charRecord.id }, { wounds });
    u.send(`Applied %cy${applied}%cn hits to %cy${LOCATION_LABELS[loc]}%cn. HP: ${wounds[loc]} remaining. Status: ${combatStatus({ ...charRecord, wounds })}`);
  },
});

addCmd({
  name: "+heal",
  pattern: /^\+heal(?:\s+(.+)=)?\s*(.*)/i,
  lock: "connected",
  category: "Combat",
  help: `+heal <location>            — Roll First Aid on your own location.
+heal <player>=<location>   — Roll First Aid on another player.

Examples:
  +heal torso              Apply first aid to your torso (once per wound).
  +heal Alice=rArm         Apply first aid to Alice's right arm.`,
  exec: async (u: IUrsamuSDK) => {
    const targetArg = u.cmd.args[0] ? u.util.stripSubs(u.cmd.args[0]).trim() : null;
    const locRaw    = u.util.stripSubs(u.cmd.args[1] ?? "").trim() || (targetArg ? "" : "torso");

    let healer: IMektonChar | null = await chars.findOne({ playerId: u.me.id });
    let patient: IMektonChar | null = healer;

    if (targetArg) {
      const target = await u.util.target(u.me, targetArg, true);
      if (!target) { u.send(`Target "${targetArg}" not found.`); return; }
      patient = await chars.findOne({ playerId: target.id });
    }
    if (!healer || !patient) { u.send("No character found."); return; }

    const loc = parseLocation(locRaw || "torso");
    if (!loc) { u.send(`Unknown location "${locRaw}". Valid: ${VALID_LOCATIONS.join(", ")}.`); return; }

    if (patient.firstAidApplied?.[loc]) {
      u.send(`First aid already applied to ${LOCATION_LABELS[loc]} this wound. It must heal first.`); return;
    }

    const firstAidSkill = healer.skills["First Aid"] ?? 0;
    const roll = rollInterlock(healer.stats.tech, firstAidSkill);
    const healed = Math.max(1, Math.ceil(Math.random() * 6));
    const maxHp = maxWounds(patient)[loc];
    const wounds = { ...patient.wounds };
    wounds[loc] = Math.min(maxHp, wounds[loc] + healed);
    const firstAidApplied = { ...patient.firstAidApplied, [loc]: true };

    await chars.update({ id: patient.id }, { wounds, firstAidApplied });
    u.send(`First Aid roll: TECH(${healer.stats.tech})+First Aid(${firstAidSkill})+d10 = ${roll.total}. Healed %cy${healed}%cn hits on ${patient.playerName}'s ${LOCATION_LABELS[loc]}. HP: ${wounds[loc]}/${maxHp}.`);
  },
});

addCmd({
  name: "+stun",
  pattern: /^\+stun$/i,
  lock: "connected",
  category: "Combat",
  help: `+stun  — Check or clear your stun status.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found."); return; }
    if (!char.stunned) { u.send("You are not stunned."); return; }
    await chars.update({ id: char.id }, { stunned: false });
    u.send("Stun cleared. You may act normally.");
  },
});

addCmd({
  name: "+luck",
  pattern: /^\+luck$/i,
  lock: "connected",
  category: "Combat",
  help: `+luck  — Show remaining Luck points.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found."); return; }
    u.send(`Luck remaining: %cy${char.luckRemaining}%cn / ${char.stats.luck}`);
  },
});

addCmd({
  name: "+luck/spend",
  pattern: /^\+luck\/spend\s+(\d+)/i,
  lock: "connected",
  category: "Combat",
  help: `+luck/spend <amount>  — Spend Luck points to add to your last roll.

Examples:
  +luck/spend 2    Spend 2 Luck points (+2 to last roll).`,
  exec: async (u: IUrsamuSDK) => {
    const amount = parseInt(u.cmd.args[0] ?? "0", 10);
    if (amount < 1) { u.send("Spend at least 1 Luck point."); return; }

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found."); return; }
    if (amount > char.luckRemaining) { u.send(`Not enough Luck. You have ${char.luckRemaining} remaining.`); return; }

    const luckRemaining = char.luckRemaining - amount;
    await chars.update({ id: char.id }, { luckRemaining });
    u.send(`Spent %cy${amount}%cn Luck. +${amount} to your last roll. Remaining: ${luckRemaining}/${char.stats.luck}.`);
  },
});
