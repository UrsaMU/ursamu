import { addCmd, type IUrsamuSDK, header, divider, footer } from "@ursamu/ursamu";
import {
  migrateSheet,
  type ModernAbility,
  type ModernSkill,
  type ModernSheet,
  MODERN_ABILITIES,
  MODERN_SKILLS,
  getAbilityMod,
  SKILL_ABILITY_MAP
} from "../stats/modern_sheet.ts";

export function getAbStr(s: ModernSheet, ab: ModernAbility): string {
  const val = s.abilities[ab];
  const mod = getAbilityMod(val);
  const sign = mod >= 0 ? "+" : "";
  return `${val.toString().padStart(2)} (${sign}${mod})`;
}

export function formatSkill(s: ModernSheet, sk: ModernSkill): string {
  if (!sk) return "";
  const ab = SKILL_ABILITY_MAP[sk];
  const mod = getAbilityMod(s.abilities[ab]);
  const isProf = s.skills.includes(sk);
  const bonus = isProf ? 3 : 0;
  const total = mod + bonus;
  const sign = total >= 0 ? "+" : "";
  const box = isProf ? "%cg[X]%cn" : "%cx[ ]%cn";
  const label = sk.split("_").map(w =>
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(" ");
  const abLabel = ab.slice(0, 3).toUpperCase();
  return `${box} ${label.padEnd(16)} (${abLabel}) : ${sign}${total}`;
}

export function renderSheetText(
  u: IUrsamuSDK,
  name: string,
  s: ModernSheet
): string {
  const nameL = u.util.ljust(` %cyName:%cn ${name}`, 26);
  const classL = u.util.ljust(` %cyClass:%cn ${s.class} ${s.level}`, 26);
  const occL = u.util.ljust(` %cyOccupation:%cn ${s.occupation}`, 24);
  const row1 = `  ${nameL}${classL}${occL}`;

  const strStr = u.util.ljust(` %cySTR:%cn ${getAbStr(s, "strength")}`, 22);
  const intStr = u.util.ljust(` %cyINT:%cn ${getAbStr(s, "intelligence")}`, 22);
  const dexStr = u.util.ljust(` %cyDEX:%cn ${getAbStr(s, "dexterity")}`, 22);
  const wisStr = u.util.ljust(` %cyWIS:%cn ${getAbStr(s, "wisdom")}`, 22);
  const conStr = u.util.ljust(` %cyCON:%cn ${getAbStr(s, "constitution")}`, 22);
  const chaStr = u.util.ljust(` %cyCHA:%cn ${getAbStr(s, "charisma")}`, 22);

  const abRow1 = `  ${strStr}${intStr}`;
  const abRow2 = `  ${dexStr}${wisStr}`;
  const abRow3 = `  ${conStr}${chaStr}`;

  const hpStr = u.util.ljust(` %cyHP:%cn ${s.hp.current} / ${s.hp.max}`, 22);
  const apStr = u.util.ljust(` %cyAction Points:%cn ${s.actionPoints}`, 22);
  const wealthStr = u.util.ljust(` %cyWealth Bonus:%cn +${s.wealth}`, 22);
  const repStr = u.util.ljust(` %cyReputation:%cn +${s.reputation}`, 22);

  const vitRow1 = `  ${hpStr}${apStr}`;
  const vitRow2 = `  ${wealthStr}${repStr}`;

  const skillLines: string[] = [];
  for (let i = 0; i < MODERN_SKILLS.length; i += 2) {
    const s1 = MODERN_SKILLS[i];
    const s2 = MODERN_SKILLS[i + 1];
    const col1 = u.util.ljust(formatSkill(s, s1), 35);
    const col2 = u.util.ljust(s2 ? formatSkill(s, s2) : "", 35);
    skillLines.push(`  ${col1}  ${col2}`);
  }

  const featStr = s.feats && s.feats.length > 0 ? s.feats.join(", ") : "None";
  const talentStr = s.talent || "None";
  const allegianceStr = s.allegiances && s.allegiances.length > 0
    ? s.allegiances.join(", ")
    : "None";

  return `${header("D20 MODERN CHARACTER SHEET")}
${row1}
${divider("V I T A L S")}
${vitRow1}
${vitRow2}
${divider("A B I L I T I E S")}
${abRow1}
${abRow2}
${abRow3}
${divider("S K I L L S")}
${skillLines.join("\n")}
${divider("T A L E N T S  &  A L L E G I A N C E S")}
  %cyTalent:%cn ${talentStr}
  %cyAllegiances:%cn ${allegianceStr}
${divider("F E A T S")}
  %cyFeats:%cn ${featStr}
${footer()}`;
}

export async function modernSheetExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const args = (u.cmd.args[1] ?? "").trim();

  // If set switch is used
  if (sw === "set") {
    // Expected format: <player>=<trait>=<value> or <trait>=<value>
    const eqIdx = args.indexOf("=");
    if (eqIdx === -1) {
      u.send("Usage: +sheet/set [<player>=]<trait>=<value>");
      return;
    }

    let targetName = "";
    let traitExpr = "";
    
    // Check if double equals or if there is a target player
    const targetMatch = args.match(/^([^=]+)=([^=]+)=([^=]+)$/);
    if (targetMatch) {
      targetName = targetMatch[1].trim();
      traitExpr = `${targetMatch[2].trim()}=${targetMatch[3].trim()}`;
    } else {
      traitExpr = args;
    }

    const traitParts = traitExpr.split("=");
    const traitName = traitParts[0].trim().toLowerCase();
    const traitVal = traitParts[1].trim();

    let target = u.me;
    if (targetName) {
      const resolved = await u.util.target(u.me, targetName, true);
      if (!resolved) {
        u.send(`Player '${targetName}' not found.`);
        return;
      }
      target = resolved;
    }

    if (!(await u.canEdit(u.me, target))) {
      u.send("Permission denied.");
      return;
    }

    const sheet = migrateSheet(target.state?.d20_modern);

    if (MODERN_ABILITIES.includes(traitName as ModernAbility)) {
      const val = parseInt(traitVal, 10);
      if (isNaN(val) || val < 1 || val > 30) {
        u.send("Abilities must be a number between 1 and 30.");
        return;
      }
      sheet.abilities[traitName as ModernAbility] = val;
    } else if (traitName === "class") {
      sheet.class = traitVal;
    } else if (traitName === "occupation") {
      sheet.occupation = traitVal;
    } else if (traitName === "level") {
      const val = parseInt(traitVal, 10);
      if (isNaN(val) || val < 1 || val > 20) {
        u.send("Level must be a number between 1 and 20.");
        return;
      }
      sheet.level = val;
    } else if (traitName === "hp" || traitName === "max_hp") {
      const val = parseInt(traitVal, 10);
      if (isNaN(val) || val < 1) {
        u.send("HP must be a positive number.");
        return;
      }
      sheet.hp.max = val;
      sheet.hp.current = val;
    } else if (traitName === "wealth") {
      const val = parseInt(traitVal, 10);
      if (isNaN(val)) {
        u.send("Wealth must be a number.");
        return;
      }
      sheet.wealth = val;
    } else if (traitName === "reputation") {
      const val = parseInt(traitVal, 10);
      if (isNaN(val)) {
        u.send("Reputation must be a number.");
        return;
      }
      sheet.reputation = val;
    } else if (traitName === "action_points" || traitName === "ap") {
      const val = parseInt(traitVal, 10);
      if (isNaN(val) || val < 0) {
        u.send("Action Points must be a non-negative number.");
        return;
      }
      sheet.actionPoints = val;
    } else if (traitName === "talent") {
      sheet.talent = traitVal;
    } else if (traitName === "allegiance") {
      const idx = sheet.allegiances.indexOf(traitVal);
      if (idx === -1) {
        if (sheet.allegiances.length >= 3) {
          u.send("You can only have up to 3 allegiances.");
          return;
        }
        sheet.allegiances.push(traitVal);
      }
    } else if (traitName === "allegiances") {
      sheet.allegiances = traitVal
        .split(",")
        .map(a => a.trim())
        .filter(Boolean)
        .slice(0, 3);
    } else {
      u.send(`Invalid or uneditable trait: '${traitName}'.`);
      return;
    }

    await u.db.modify(target.id, "$set", { "state.d20_modern": sheet });
    u.send(
      `Set ${u.util.displayName(target, u.me)}'s ` +
      `${traitName} to ${traitVal}.`
    );
    return;
  }

  // Otherwise view sheet
  let target = u.me;
  if (args) {
    const resolved = await u.util.target(u.me, args, true);
    if (!resolved) {
      u.send(`Player '${args}' not found.`);
      return;
    }
    target = resolved;
  }

  const sheet = migrateSheet(target.state?.d20_modern);
  u.send(renderSheetText(u, u.util.displayName(target, u.me), sheet));
}

addCmd({
  name: "+sheet",
  pattern: /^\+sheet(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "D20 Modern",
  help: `+sheet [<player>]
+sheet/set [<player>=]<trait>=<value>

Switches:
  /set    Modify a character sheet value (requires admin or self).

Examples:
  +sheet
  +sheet Bob
  +sheet/set strength=14`,
  exec: modernSheetExec
});
