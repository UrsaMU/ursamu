import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  defaultSheet,
  DND_ABILITIES,
  DND_SKILLS,
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  SKILL_ABILITY_MAP,
} from "../stats/dnd_sheet.ts";
import { maybeSpendInspiration } from "../stats/rules.ts";
import type { AdvState } from "../stats/conditions.ts";

interface RollResult {
  rolls: number[];
  selected: number;
  notation: string;
}

function rollDice(count: number, sides: number): RollResult {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  return {
    rolls,
    selected: sum,
    notation: `${count}d${sides}(${rolls.join(", ")})`
  };
}

function rollD20(adv: boolean, dis: boolean): RollResult {
  const r1 = Math.floor(Math.random() * 20) + 1;
  if (adv || dis) {
    const r2 = Math.floor(Math.random() * 20) + 1;
    const selected = adv ? Math.max(r1, r2) : Math.min(r1, r2);
    const notation = adv
      ? `d20[Adv](${r1}, ${r2} -> ${selected})`
      : `d20[Dis](${r1}, ${r2} -> ${selected})`;
    return { rolls: [r1, r2], selected, notation };
  }
  return { rolls: [r1], selected: r1, notation: `d20(${r1})` };
}

export async function dndRollExec(u: IUrsamuSDK) {
  const swRaw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  let expr = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  // Multi-switch parsing
  const switches = swRaw
    ? swRaw.split(/[\/,]/).map((s) => s.trim()).filter(Boolean)
    : [];

  let wantAdv = switches.includes("adv") ||
    switches.includes("advantage");
  const wantDis = switches.includes("dis") ||
    switches.includes("disadvantage");
  const wantInsp = switches.includes("insp") ||
    switches.includes("inspiration");
  const isInit = switches.includes("init") ||
    switches.includes("initiative") ||
    expr.toLowerCase() === "init";

  let sheet = migrateSheet(u.me.state?.dnd || defaultSheet());
  let advState: AdvState = "normal";
  if (wantAdv && wantDis) advState = "normal";
  else if (wantAdv) advState = "advantage";
  else if (wantDis) advState = "disadvantage";

  if (wantInsp) {
    const spent = maybeSpendInspiration(sheet, true, advState);
    sheet = spent.sheet;
    advState = spent.adv;
    if (spent.spent) {
      await u.db.modify(u.me.id, "$set", { "data.dnd": sheet });
      // deno-lint-ignore no-explicit-any
      if (u.me.state) (u.me.state as any).dnd = sheet;
    }
  }

  const adv = advState === "advantage";
  const dis = advState === "disadvantage";
  const name = u.util.displayName(u.me, u.me);
  const profBonus = getProficiencyBonus(sheet.level);
  const strMod = getAbilityMod(sheet.abilities.strength);
  const dexMod = getAbilityMod(sheet.abilities.dexterity);

  if (isInit) {
    const r = rollD20(adv, dis);
    const total = r.selected + dexMod;
    const sign = dexMod >= 0 ? "+" : "";
    const msg =
      `${name} rolls %chInitiative%cn: ${r.notation} ` +
      `${sign}${dexMod} (Dex) = %ch%cy${total}%cn`;
    u.send(msg);
    return;
  }

  if (!expr) {
    u.send("Usage: +roll[/adv|/dis] <ability|skill|save <ability>|attack|damage|formula> (e.g. +roll Strength, +roll/adv Stealth, +roll attack, +roll damage, +roll 2d6+3)");
    return;
  }

  // Parse check type
  expr = expr.toLowerCase();

  // 0a. Weapon Attack Check
  if (expr === "attack" || expr === "att") {
    const items = await u.db.search({ location: u.me.id });
    const weapon = items.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "weapon" && (item.state as any).dnd?.equipped);

    let attackAbilityLabel = "Str";
    let attackMod = strMod;
    let weaponName = "Unarmed Strike";

    if (weapon) {
      weaponName = weapon.name || "Weapon";
      const props = ((weapon.state as any).dnd.properties as string[]) || [];
      const weaponType = ((weapon.state as any).dnd.weaponType as string) || "melee";
      
      if (weaponType === "ranged") {
        attackMod = dexMod;
        attackAbilityLabel = "Dex";
      } else if (props.includes("finesse")) {
        if (dexMod > strMod) {
          attackMod = dexMod;
          attackAbilityLabel = "Dex";
        } else {
          attackMod = strMod;
          attackAbilityLabel = "Str";
        }
      } else {
        attackMod = strMod;
        attackAbilityLabel = "Str";
      }
    }

    const isUnarmed = !weapon;
    const profTerm = isUnarmed ? 0 : profBonus;

    const r = rollD20(adv, dis);
    const total = r.selected + attackMod + profTerm;
    const terms = [
      `${attackMod >= 0 ? "+" : ""}${attackMod} (${attackAbilityLabel})`,
      profTerm ? `+${profTerm} (Prof)` : ""
    ].filter(Boolean).join(" ");

    const msg = `${name} attacks with %ch${weaponName}%cn: ${r.notation} ${terms} = %ch%cy${total}%cn to hit`;
    u.send(msg);
    return;
  }

  // 0b. Weapon Damage Check
  if (expr === "damage" || expr === "dmg") {
    const items = await u.db.search({ location: u.me.id });
    const weapon = items.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "weapon" && (item.state as any).dnd?.equipped);

    let attackAbilityLabel = "Str";
    let attackMod = strMod;
    let damageDie = "1d4";
    let damageType = "bludgeoning";
    let weaponName = "Unarmed Strike";

    if (weapon) {
      weaponName = weapon.name || "Weapon";
      damageDie = ((weapon.state as any).dnd.damage as string) || "1d6";
      damageType = ((weapon.state as any).dnd.damageType as string) || "slashing";
      const props = ((weapon.state as any).dnd.properties as string[]) || [];
      const weaponType = ((weapon.state as any).dnd.weaponType as string) || "melee";
      
      if (weaponType === "ranged") {
        attackMod = dexMod;
        attackAbilityLabel = "Dex";
      } else if (props.includes("finesse")) {
        if (dexMod > strMod) {
          attackMod = dexMod;
          attackAbilityLabel = "Dex";
        } else {
          attackMod = strMod;
          attackAbilityLabel = "Str";
        }
      } else {
        attackMod = strMod;
        attackAbilityLabel = "Str";
      }
    }

    const match = damageDie.match(/^(\d+)[dD](\d+)$/);
    if (!match) {
      u.send(`Error: Invalid damage die formula on weapon: "${damageDie}"`);
      return;
    }
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);

    const r = rollDice(count, sides);
    const total = r.selected + attackMod;
    const sign = attackMod >= 0 ? "+" : "";

    const msg = `${name} rolls %ch${weaponName} Damage%cn: ${r.notation} ${sign}${attackMod} (${attackAbilityLabel}) = %ch%cy${total}%cn ${damageType} damage`;
    u.send(msg);
    return;
  }

  // 1. Saving Throws: "save strength", "save str", etc.
  if (expr.startsWith("save ")) {
    const abName = expr.slice(5).trim();
    const ab = DND_ABILITIES.find(
      (a) => a === abName || a.slice(0, 3) === abName.slice(0, 3)
    );
    if (!ab) {
      u.send(`Error: Unknown ability for saving throw: "${abName}"`);
      return;
    }

    const score = sheet.abilities[ab];
    const mod = getAbilityMod(score);
    const isProf = sheet.savingThrowProficiency.includes(ab);
    const profTerm = isProf ? profBonus : 0;
    
    const r = rollD20(adv, dis);
    const total = r.selected + mod + profTerm;
    
    const terms = [
      `${mod >= 0 ? "+" : ""}${mod} (${ab.slice(0, 3).toUpperCase()})`,
      isProf ? `+${profBonus} (Prof)` : ""
    ].filter(Boolean).join(" ");

    const dispName = ab.charAt(0).toUpperCase() + ab.slice(1);
    const msg = `${name} rolls %ch${dispName} Saving Throw%cn: ${r.notation} ${terms} = %ch%cy${total}%cn`;
    u.send(msg);
    return;
  }

  // 2. Skills
  const skill = DND_SKILLS.find(
    (s) => s === expr || s.replace(/_/g, "") === expr.replace(/\s+/g, "") || s.replace(/_/g, " ") === expr
  );
  if (skill) {
    const ab = SKILL_ABILITY_MAP[skill];
    const score = sheet.abilities[ab];
    const mod = getAbilityMod(score);
    const profType = sheet.skillProficiency[skill] || "none";
    let profTerm = 0;
    let profLabel = "";
    if (profType === "proficient") {
      profTerm = profBonus;
      profLabel = `+${profBonus} (Prof)`;
    } else if (profType === "expert") {
      profTerm = profBonus * 2;
      profLabel = `+${profBonus * 2} (Expert)`;
    }

    const r = rollD20(adv, dis);
    const total = r.selected + mod + profTerm;
    const terms = [
      `${mod >= 0 ? "+" : ""}${mod} (${ab.slice(0, 3).toUpperCase()})`,
      profLabel
    ].filter(Boolean).join(" ");

    const dispName = skill.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const msg = `${name} rolls %ch${dispName}%cn: ${r.notation} ${terms} = %ch%cy${total}%cn`;
    u.send(msg);
    return;
  }

  // 3. Abilities
  const ab = DND_ABILITIES.find(
    (a) => a === expr || a.slice(0, 3) === expr.slice(0, 3)
  );
  if (ab) {
    const score = sheet.abilities[ab];
    const mod = getAbilityMod(score);
    const r = rollD20(adv, dis);
    const total = r.selected + mod;
    const terms = `${mod >= 0 ? "+" : ""}${mod} (${ab.slice(0, 3).toUpperCase()})`;

    const dispName = ab.charAt(0).toUpperCase() + ab.slice(1);
    const msg = `${name} rolls %ch${dispName} Check%cn: ${r.notation} ${terms} = %ch%cy${total}%cn`;
    u.send(msg);
    return;
  }

  // 4. Custom Dice Formulas: e.g. "2d6+3", "1d20 - 2"
  const diceRegex = /^(\d+)[dD](\d+)(?:\s*([+-])\s*(\d+))?$/;
  const match = expr.replace(/\s+/g, "").match(diceRegex);
  if (match) {
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const op = match[3];
    const modifier = match[4] ? parseInt(match[4], 10) : 0;

    const r = rollDice(count, sides);
    let total = r.selected;
    let modTerm = "";
    if (op && modifier) {
      modTerm = ` ${op} ${modifier}`;
      total = op === "+" ? total + modifier : total - modifier;
    }

    const msg = `${name} rolls %ch${expr}%cn: ${r.notation}${modTerm} = %ch%cy${total}%cn`;
    u.send(msg);
    return;
  }

  u.send(`Error: Could not parse roll expression "${expr}". Use an ability (e.g. Strength), skill (e.g. Stealth), save (e.g. save Dexterity), or formula (e.g. 1d20+5).`);
}

addCmd({
  name: "+roll",
  pattern: /^\+roll(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+roll[/adv|/dis|/init] <expression>  -- Roll checks.

Switches:
  /adv           Roll with Advantage (take highest of 2 d20s)
  /dis           Roll with Disadvantage (take lowest of 2 d20s)
  /init          Roll initiative (d20 + Dex modifier)

Examples:
  +roll Strength
  +roll/adv Stealth
  +roll save Wisdom
  +roll/init
  +roll 2d6+3`,
  exec: dndRollExec
});
