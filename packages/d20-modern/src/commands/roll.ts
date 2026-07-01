import { addCmd, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  migrateSheet,
  MODERN_ABILITIES,
  MODERN_SKILLS,
  getAbilityMod,
  SKILL_ABILITY_MAP
} from "../stats/modern_sheet.ts";

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

export async function modernRollExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const expr = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  const useAp = sw === "ap";
  const sheet = migrateSheet(u.me.state?.d20_modern);
  const name = u.util.displayName(u.me, u.me);

  if (!expr) {
    u.send(
      "Usage: +roll[/ap] <ability|skill|formula> " +
      "(e.g. +roll strength, +roll/ap Computer Use, +roll 2d6+3)"
    );
    return;
  }

  if (useAp && sheet.actionPoints <= 0) {
    u.send("You do not have any Action Points remaining!");
    return;
  }

  // Parse formula if matching e.g. 1d20+5 or 2d6+3
  const formulaRegex = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i;
  const match = expr.match(formulaRegex);

  if (match) {
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const op = match[3];
    const modVal = match[4] ? parseInt(match[4], 10) : 0;
    
    const r = rollDice(count, sides);
    let total = r.selected;
    if (op === "+") total += modVal;
    if (op === "-") total -= modVal;
    
    let apText = "";
    if (useAp) {
      const apRoll = Math.floor(Math.random() * 6) + 1;
      total += apRoll;
      sheet.actionPoints -= 1;
      await u.db.modify(u.me.id, "$set", { "state.d20_modern": sheet });
      apText = ` + %ch%cy${apRoll}%cn [AP]`;
    }

    const modText = modVal ? ` ${op} ${modVal}` : "";
    u.send(
      `%ch%ccROLL>>%cn ${name} rolls %ch${expr}%cn: ` +
      `${r.notation}${modText}${apText} = %ch%cy${total}%cn`
    );
    return;
  }

  // Otherwise treat as trait/ability check
  const exprLower = expr.toLowerCase().replace(/\s+/g, "_");
  let traitLabel = expr;
  let modifier = 0;

  if (MODERN_ABILITIES.includes(exprLower as ModernAbility)) {
    const score = sheet.abilities[exprLower as ModernAbility];
    modifier = getAbilityMod(score);
    traitLabel = expr.toUpperCase();
  } else if (MODERN_SKILLS.includes(exprLower as ModernSkill)) {
    const skill = exprLower as typeof MODERN_SKILLS[number];
    const ab = SKILL_ABILITY_MAP[skill];
    const score = sheet.abilities[ab];
    const mod = getAbilityMod(score);
    const isProf = sheet.skills.includes(skill);
    // In d20 modern, if proficient you roll d20 + ability mod + ranks.
    // Let's assume proficiency gives a flat +3 for simplicity.
    modifier = mod + (isProf ? 3 : 0);
    traitLabel = expr.split("_").map(w =>
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join(" ");
  } else {
    u.send(`Unknown trait or invalid formula: '${expr}'.`);
    return;
  }

  const d20 = Math.floor(Math.random() * 20) + 1;
  let total = d20 + modifier;
  const sign = modifier >= 0 ? "+" : "";

  let apText = "";
  if (useAp) {
    const apRoll = Math.floor(Math.random() * 6) + 1;
    total += apRoll;
    sheet.actionPoints -= 1;
    await u.db.modify(u.me.id, "$set", { "state.d20_modern": sheet });
    apText = ` + %ch%cy${apRoll}%cn [AP]`;
  }

  u.send(
    `%ch%ccROLL>>%cn ${name} rolls %ch${traitLabel}%cn Check: ` +
    `d20(${d20}) ${sign}${modifier}${apText} = %ch%cy${total}%cn`
  );
}

addCmd({
  name: "+roll",
  pattern: /^\+roll(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "D20 Modern",
  help: `+roll[/ap] <ability|skill|formula>

Switches:
  /ap     Spend 1 Action Point to add 1d6 to the check.

Examples:
  +roll strength
  +roll/ap Computer Use
  +roll 1d20+5`,
  exec: modernRollExec
});
