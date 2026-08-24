import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import { getAbilityMod, migrateSheet } from "../stats/dnd_sheet.ts";
import { applyDamage, applyHeal } from "../stats/vitality.ts";
import { maybeProcessPlayerDeath } from
  "../stats/player-death.ts";
import { CLASS_METADATA } from "./cg.ts";

export async function dndHpExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rawArg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  // Parse argument for target and amount:
  // e.g. "10" or "Marcus=10" or "10 for Marcus"
  let amount = 0;
  let targetName = "";

  if (rawArg) {
    const eqIdx = rawArg.indexOf("=");
    if (eqIdx >= 0) {
      targetName = rawArg.slice(0, eqIdx).trim();
      amount = parseInt(rawArg.slice(eqIdx + 1).trim(), 10);
    } else {
      const forIdx = rawArg.toLowerCase().indexOf(" for ");
      if (forIdx >= 0) {
        amount = parseInt(rawArg.slice(0, forIdx).trim(), 10);
        targetName = rawArg.slice(forIdx + 5).trim();
      } else {
        const parsed = parseInt(rawArg, 10);
        if (!isNaN(parsed)) {
          amount = parsed;
        } else {
          targetName = rawArg;
        }
      }
    }
  }

  const target = targetName ? await u.util.target(u.me, targetName) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }

  const sheet = target.state?.dnd;
  if (!sheet) {
    u.send("That player does not have a character sheet yet.");
    return;
  }

  const s = migrateSheet(sheet);

  if (!sw) {
    // Just view HP
    u.send(`${u.util.displayName(target, u.me)}'s hit points: %ch${s.hp.current}%cn / %ch${s.hp.max}%cn (temp %ch${s.hp.temp}%cn)`);
    return;
  }

  // Authorization check for modifiers
  if (!(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's hit points.");
    return;
  }

  if (isNaN(amount) || amount < 0) {
    u.send("Error: Amount must be a positive integer.");
    return;
  }

  const name = u.util.displayName(target, u.me);

  if (sw === "damage" || sw === "dmg") {
    const initialTemp = s.hp.temp;
    const initialCurrent = s.hp.current;
    const dmg = applyDamage(s, amount);
    let next = dmg.sheet;
    await u.db.modify(target.id, "$set", { "data.dnd": next });
    // deno-lint-ignore no-explicit-any
    if (target.state) (target.state as any).dnd = next;
    u.send(
      `%ch${name}%cn takes %ch%cr${amount}%cn damage! ` +
        `(temp ${initialTemp}→${next.hp.temp}, ` +
        `HP ${initialCurrent}→${next.hp.current})`,
    );
    for (const ln of dmg.lines) {
      u.send(ln);
    }
    if (next.death?.dead && target.flags?.has?.("player")) {
      const death = await maybeProcessPlayerDeath(
        u,
        target,
        next,
      );
      next = death.sheet;
    }
  } else if (sw === "heal") {
    const h = applyHeal(s, amount);
    await u.db.modify(target.id, "$set", { "data.dnd": h.sheet });
    // deno-lint-ignore no-explicit-any
    if (target.state) (target.state as any).dnd = h.sheet;
    u.send(
      `%ch${name}%cn is healed for %ch%cg${h.healed}%cn HP. ` +
        `(${h.sheet.hp.current}/${h.sheet.hp.max})`,
    );
    for (const ln of h.lines) {
      u.send(ln);
    }
  } else if (sw === "temp") {
    // Temporary hit points do not stack. If you receive new ones, you choose which to keep (usually the highest)
    const initialTemp = s.hp.temp;
    s.hp.temp = Math.max(s.hp.temp, amount);
    await u.db.modify(target.id, "$set", { "data.dnd": s });
    u.send(`%ch${name}%cn gains %ch${amount}%cn temporary HP (temp ${initialTemp} → ${s.hp.temp}).`);
  } else {
    u.send(`Error: Unknown switch '/${sw}'. Valid: /damage, /heal, /temp.`);
  }
}

addCmd({
  name: "+hp",
  pattern: /^\+(?:hp|health)(?:\/([a-z\-]+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+hp [<player>]  -- View or modify Hit Points. (Alias: +health)

Switches:
  /damage <n>                  Apply N damage. Temp HP absorbs first.
  /heal <n>                    Heal N damage, up to max HP.
  /temp <n>                    Grant N temporary HP (takes highest, does not stack).

Examples:
  +hp
  +hp/damage 10
  +health/heal 5 for Marcus
  +hp/temp 8`,
  exec: dndHpExec
});

addCmd({
  name: "+rest",
  pattern: /^\+rest(?:\/([a-z\-]+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+rest/<short|long> [<dice_count>]  -- Rest to recover resources.

Switches:
  /short [<dice>]             Spend 1 or more Hit Dice to roll and heal.
  /long                       Take a long rest to fully recover HP, spell slots, and half Hit Dice.

Examples:
  +rest/short
  +rest/short 2
  +rest/long`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const target = u.me;

    if (!target.state?.dnd) {
      u.send("You do not have a character sheet yet.");
      return;
    }

    const sheet = migrateSheet(target.state.dnd);

    if (sw === "short") {
      let diceToSpend = parseInt(arg, 10);
      if (isNaN(diceToSpend) || diceToSpend <= 0) {
        diceToSpend = 1;
      }

      if (sheet.hitDice.current < diceToSpend) {
        u.send(
          `You only have ${sheet.hitDice.current} Hit Dice remaining ` +
            `(attempted to spend ${diceToSpend}).`
        );
        return;
      }

      const classKeys = Object.keys(sheet.classes);
      if (classKeys.length === 0) {
        u.send("Error: Character has no classes.");
        return;
      }

      const primaryClass = classKeys[0].toLowerCase();
      const hitDie = CLASS_METADATA[primaryClass]?.hitDie || 8;
      const conMod = getAbilityMod(sheet.abilities.constitution || 10);

      let totalHeal = 0;
      const rolls: number[] = [];
      for (let i = 0; i < diceToSpend; i++) {
        const roll = Math.floor(Math.random() * hitDie) + 1;
        rolls.push(roll);
        totalHeal += Math.max(1, roll + conMod);
      }

      sheet.hitDice.current -= diceToSpend;
      const initialHP = sheet.hp.current;
      sheet.hp.current = Math.min(sheet.hp.max, sheet.hp.current + totalHeal);
      const actualHealed = sheet.hp.current - initialHP;

      await u.db.modify(target.id, "$set", { "data.dnd": sheet });

      const rollsStr = rolls.map((r) => `d${hitDie}(${r})`).join(" + ");
      u.send(
        `You take a %chshort rest%cn, spending ${diceToSpend} ` +
          `Hit Dice. Rolls: ${rollsStr} + Con(${conMod * diceToSpend}) = ` +
          `${totalHeal} HP. Healed %ch${actualHealed}%cn HP (now ` +
          `${sheet.hp.current}/${sheet.hp.max}, Hit Dice: ` +
          `${sheet.hitDice.current}/${sheet.hitDice.max}).`
      );
    } else if (sw === "long") {
      const initialHP = sheet.hp.current;
      sheet.hp.current = sheet.hp.max;
      sheet.hp.temp = 0;

      for (let i = 1; i <= 9; i++) {
        sheet.spellSlotsCurrent[i] = sheet.spellSlotsMax[i] || 0;
      }

      const hdToRestore = Math.max(1, Math.floor(sheet.hitDice.max / 2));
      const initialHD = sheet.hitDice.current;
      sheet.hitDice.current = Math.min(
        sheet.hitDice.max,
        sheet.hitDice.current + hdToRestore
      );

      await u.db.modify(target.id, "$set", { "data.dnd": sheet });

      u.send(
        `You take a %chlong rest%cn. Hit points fully restored ` +
          `(${initialHP} → ${sheet.hp.current}), spell slots restored, ` +
          `and Hit Dice regained (${initialHD} → ${sheet.hitDice.current}/` +
          `${sheet.hitDice.max}).`
      );
    } else {
      u.send("Usage: +rest/short [<dice>] or +rest/long");
    }
  }
});
