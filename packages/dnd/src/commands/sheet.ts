import { addCmd, type IUrsamuSDK, header, divider, footer } from "@ursamu/mush";
import {
  defaultSheet,
  type DndAbility,
  type DndSheet,
  type DndSkill,
  DND_ABILITIES,
  DND_SKILLS,
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  SKILL_ABILITY_MAP
} from "../stats/dnd_sheet.ts";
import { buildSheetWebLayoutHtml } from "../sheet/sheet-html.ts";

export async function formatSheet(u: IUrsamuSDK, name: string, sheet: DndSheet, playerId: string): Promise<string> {
  const s = migrateSheet(sheet);
  const prof = getProficiencyBonus(s.level);
  
  const getAbStr = (ab: DndAbility) => {
    const val = s.abilities[ab];
    const mod = getAbilityMod(val);
    const sign = mod >= 0 ? "+" : "";
    return `${val.toString().padStart(2)} (${sign}${mod})`;
  };

  const getSaveStr = (ab: DndAbility) => {
    const val = s.abilities[ab];
    const mod = getAbilityMod(val);
    const isProf = s.savingThrowProficiency.includes(ab);
    const saveMod = mod + (isProf ? prof : 0);
    const sign = saveMod >= 0 ? "+" : "";
    const box = isProf ? "%cg[X]%cn" : "%cx[ ]%cn";
    return `${box} ${ab.slice(0, 3).toUpperCase()} (${sign}${saveMod})`;
  };

  // Passive Perception = 10 + Wisdom Modifier + Perception Proficiency/Expertise bonus
  const wisMod = getAbilityMod(s.abilities.wisdom);
  let perpBonus = 0;
  const perpProf = s.skillProficiency.perception || "none";
  if (perpProf === "proficient") perpBonus = prof;
  else if (perpProf === "expert") perpBonus = prof * 2;
  const passivePerception = 10 + wisMod + perpBonus;

  // Header Info
  const nameL = u.util.ljust(` %cyName:%cn ${name}`, 26);
  const classL = u.util.ljust(
    s.class.includes("/")
      ? ` %cyClass:%cn ${s.class}`
      : ` %cyClass:%cn ${s.class} ${s.level}`,
    26
  );
  const specL = u.util.ljust(` %cySpecies:%cn ${s.species}`, 24);
  const row1 = `  ${nameL}${classL}${specL}`;

  const bgL = u.util.ljust(` %cyBackground:%cn ${s.background}`, 26);
  const subL = u.util.ljust(` %cySubclass:%cn ${s.subclass || "None"}`, 26);
  const emptyL = u.util.ljust("", 24);
  const row2 = `  ${bgL}${subL}${emptyL}`;

  // Ability table
  const strStr = u.util.ljust(` %cySTR:%cn ${getAbStr("strength")}`, 22);
  const intStr = u.util.ljust(` %cyINT:%cn ${getAbStr("intelligence")}`, 22);
  const dexStr = u.util.ljust(` %cyDEX:%cn ${getAbStr("dexterity")}`, 22);
  const wisStr = u.util.ljust(` %cyWIS:%cn ${getAbStr("wisdom")}`, 22);
  const conStr = u.util.ljust(` %cyCON:%cn ${getAbStr("constitution")}`, 22);
  const chaStr = u.util.ljust(` %cyCHA:%cn ${getAbStr("charisma")}`, 22);

  const saveStr = u.util.ljust(`   ${getSaveStr("strength")}   ${getSaveStr("intelligence")}`, 30);
  const saveDex = u.util.ljust(`   ${getSaveStr("dexterity")}   ${getSaveStr("wisdom")}`, 30);
  const saveCon = u.util.ljust(`   ${getSaveStr("constitution")}   ${getSaveStr("charisma")}`, 30);

  const abRow1 = `  ${strStr}${intStr}${saveStr}`;
  const abRow2 = `  ${dexStr}${wisStr}${saveDex}`;
  const abRow3 = `  ${conStr}${chaStr}${saveCon}`;

  // Dynamic AC calculation based on equipped items
  const dexMod = getAbilityMod(s.abilities.dexterity);
  const items = await u.db.search({ location: playerId });
  const equippedArmor = items.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "armor" && (item.state as any).dnd?.equipped);
  const equippedShield = items.find(item => item.flags.has("thing") && (item.state as any).dnd?.type === "shield" && (item.state as any).dnd?.equipped);

  let activeAc = 10;
  if (equippedArmor) {
    const armorAc = ((equippedArmor.state as any).dnd.ac as number) || 10;
    const armorType = ((equippedArmor.state as any).dnd.armorType as string) || "light";
    if (armorType === "light") {
      activeAc = armorAc + dexMod;
    } else if (armorType === "medium") {
      activeAc = armorAc + Math.min(2, dexMod);
    } else if (armorType === "heavy") {
      activeAc = armorAc;
    }
  } else {
    activeAc = 10 + dexMod;
  }

  if (equippedShield) {
    activeAc += ((equippedShield.state as any).dnd.ac as number) || 2;
  }

  // Vital statistics
  const acStr = u.util.ljust(` %cyAC:%cn ${activeAc}`, 22);
  const hpStr = u.util.ljust(` %cyHP:%cn ${s.hp.current} / ${s.hp.max}`, 22);
  const speedStr = u.util.ljust(` %cySpeed:%cn ${s.speed} ft.`, 22);
  const tempHpStr = u.util.ljust(` %cyTemp HP:%cn ${s.hp.temp}`, 22);
  const profStr = u.util.ljust(` %cyProficiency:%cn +${prof}`, 22);
  const passiveStr = u.util.ljust(` %cyPassive Perc:%cn ${passivePerception}`, 22);
  const initStr = u.util.ljust(` %cyInitiative:%cn ${getAbilityMod(s.abilities.dexterity) >= 0 ? "+" : ""}${getAbilityMod(s.abilities.dexterity)}`, 30);
  const hdStr = u.util.ljust(` %cyHit Dice:%cn ${s.hitDice.current}/${s.hitDice.max}`, 30);
  const goldStr = u.util.ljust(` %cyGold:%cn ${s.gold} gp`, 22);
  const xpStr = u.util.ljust(` %cyXP:%cn ${s.xp || 0}`, 22);

  const vitRow1 = `  ${acStr}${hpStr}${initStr}`;
  const vitRow2 = `  ${speedStr}${tempHpStr}${hdStr}`;
  const vitRow3 = `  ${profStr}${passiveStr}${goldStr}`;
  const vitRow4 = `  ${xpStr}`;

  // Skills
  const formatSkill = (sk: DndSkill) => {
    if (!sk) return "";
    const ab = SKILL_ABILITY_MAP[sk];
    const mod = getAbilityMod(s.abilities[ab]);
    const pType = s.skillProficiency[sk] || "none";
    let pBonus = 0;
    let box = "%cx[ ]%cn";
    if (pType === "proficient") {
      pBonus = prof;
      box = "%cg[X]%cn";
    } else if (pType === "expert") {
      pBonus = prof * 2;
      box = "%cg[E]%cn";
    }
    const total = mod + pBonus;
    const sign = total >= 0 ? "+" : "";
    const label = sk.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const abLabel = ab.slice(0, 3).toUpperCase();
    return `${box} ${label.padEnd(20)} (${abLabel}) : ${sign}${total}`;
  };

  const skillLines: string[] = [];
  for (let i = 0; i < DND_SKILLS.length; i += 2) {
    const s1 = DND_SKILLS[i];
    const s2 = DND_SKILLS[i + 1];
    const col1 = u.util.ljust(formatSkill(s1), 36);
    const col2 = u.util.ljust(s2 ? formatSkill(s2) : "", 36);
    skillLines.push(`  ${col1}    ${col2}`);
  }

  let casterSection = "";
  const featStr = s.feats && s.feats.length > 0 ? s.feats.join(", ") : "None";

  if (s.spells && s.spells.length > 0) {
    const spellNames = s.spells.map(sp => sp.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
    const formattedSpells: string[] = [];
    for (let i = 0; i < spellNames.length; i += 4) {
      const slice = spellNames.slice(i, i + 4);
      const rowStr = slice.map((item) => u.util.ljust(`  * ${item}`, 18)).join("");
      formattedSpells.push(`    ${rowStr}`);
    }
    const spellsListStr = formattedSpells.join("\n");

    let slotsStr = "";
    if (s.spellSlotsMax && s.spellSlotsMax[1] > 0) {
      const maxSlots = s.spellSlotsMax[1];
      const curSlots = s.spellSlotsCurrent[1];
      const slotBoxes = Array.from({ length: maxSlots }, (_, idx) => idx < curSlots ? "[O]" : "[X]").join(" ");
      slotsStr = `\n  %cySpell Slots (1st):%cn  ${slotBoxes} (${curSlots}/${maxSlots})`;
    }
    casterSection = `${divider("F E A T S   &   S P E L L S")}
  %cyFeats:%cn  ${featStr}
  %cySpells:%cn
${spellsListStr}${slotsStr}`;
  } else {
    casterSection = `${divider("F E A T S")}
  %cyFeats:%cn  ${featStr}`;
  }

  return `${header("CHARACTER SHEET")}
${row1}
${row2}

${divider("A B I L I T I E S   &   S A V E S")}
${abRow1}
${abRow2}
${abRow3}

${divider("V I T A L   S T A T I S T I C S")}
${vitRow1}
${vitRow2}
${vitRow3}
${vitRow4}

${divider("S K I L L S")}
${skillLines.join("\n")}
${casterSection}
${footer()}`;
}

export async function dndSheetExec(u: IUrsamuSDK) {
  const targetName = (u.cmd.args[0] ?? "").trim();
  const target = targetName ? await u.util.target(u.me, targetName) : u.me;

  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }

  const sheet = target.state?.dnd as DndSheet | undefined;
  if (!sheet) {
    u.send("That player does not have a character sheet yet.");
    return;
  }

  const name = u.util.displayName(target, u.me);

  // Web /play: full dnd-sheet HTML (same chrome as /chargen live sheet)
  const ct = (u as { clientType?: string }).clientType;
  // deno-lint-ignore no-explicit-any
  const ui = (u as any).ui;
  if (ct === "web" && ui && typeof ui.layout === "function") {
    try {
      ui.layout(buildSheetWebLayoutHtml(name, sheet));
      return;
    } catch {
      /* fall through to text */
    }
  }

  const formatted = await formatSheet(u, name, sheet, target.id);
  u.send(formatted);
}

export async function dndSheetSetExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rawArg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (sw !== "set") {
    u.send("Usage: +sheet/set [<player>/]<trait>=<value>");
    return;
  }

  const eqIdx = rawArg.indexOf("=");
  if (eqIdx < 0) {
    u.send("Usage: +sheet/set [<player>/]<trait>=<value>");
    return;
  }

  const lhs = rawArg.slice(0, eqIdx).trim();
  const rhs = rawArg.slice(eqIdx + 1).trim();

  let targetName = "";
  let trait = lhs;

  if (lhs.includes("/")) {
    const parts = lhs.split("/");
    targetName = parts[0].trim();
    trait = parts.slice(1).join("/").trim();
  }

  const target = targetName ? await u.util.target(u.me, targetName) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }

  // Authorization check
  if (!(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's character sheet.");
    return;
  }

  const sheet = migrateSheet(target.state?.dnd || defaultSheet());
  const traitKey = trait.toLowerCase();

  // 1. Ability Score setter
  const ab = DND_ABILITIES.find(a => a === traitKey || a.slice(0, 3) === traitKey);
  if (ab) {
    const val = parseInt(rhs, 10);
    if (isNaN(val) || val < 1 || val > 30) {
      u.send("Error: Ability scores must be integers between 1 and 30.");
      return;
    }
    sheet.abilities[ab] = val;
    await u.db.modify(target.id, "$set", { "data.dnd": sheet });
    u.send(`Set ability '${ab}' to ${val} on ${target.name}'s sheet.`);
    return;
  }

  // 2. Skill Proficiency setter
  if (traitKey.startsWith("skill/")) {
    const skName = traitKey.slice(6).replace(/\s+/g, "_");
    const sk = DND_SKILLS.find(s => s === skName || s.replace(/_/g, "") === skName.replace(/_/g, ""));
    if (!sk) {
      u.send(`Error: Unknown skill: "${skName}"`);
      return;
    }
    const val = rhs.toLowerCase();
    if (val !== "none" && val !== "proficient" && val !== "expert") {
      u.send("Error: Skill proficiency must be 'none', 'proficient', or 'expert'.");
      return;
    }
    sheet.skillProficiency[sk] = val;
    await u.db.modify(target.id, "$set", { "data.dnd": sheet });
    u.send(`Set skill '${sk}' proficiency to '${val}' on ${target.name}'s sheet.`);
    return;
  }

  // 3. Saving Throw Proficiency setter
  if (traitKey.startsWith("save/")) {
    const abName = traitKey.slice(5);
    const saveAb = DND_ABILITIES.find(a => a === abName || a.slice(0, 3) === abName);
    if (!saveAb) {
      u.send(`Error: Unknown ability for saving throw: "${abName}"`);
      return;
    }
    const val = rhs.toLowerCase();
    const isProf = val === "yes" || val === "true" || val === "proficient";
    
    if (isProf) {
      if (!sheet.savingThrowProficiency.includes(saveAb)) {
        sheet.savingThrowProficiency.push(saveAb);
      }
    } else {
      sheet.savingThrowProficiency = sheet.savingThrowProficiency.filter(a => a !== saveAb);
    }
    
    await u.db.modify(target.id, "$set", { "data.dnd": sheet });
    u.send(`Set ${saveAb} saving throw proficiency to ${isProf ? "proficient" : "none"} on ${target.name}'s sheet.`);
    return;
  }

  // 4. Other basic attributes
  if (traitKey === "class") {
    sheet.class = rhs;
  } else if (traitKey === "subclass") {
    sheet.subclass = rhs;
  } else if (traitKey === "species") {
    sheet.species = rhs;
  } else if (traitKey === "background") {
    sheet.background = rhs;
  } else if (traitKey === "level") {
    const val = parseInt(rhs, 10);
    if (isNaN(val) || val < 1 || val > 20) {
      u.send("Error: Level must be between 1 and 20.");
      return;
    }
    sheet.level = val;
  } else if (traitKey === "ac") {
    const val = parseInt(rhs, 10);
    if (isNaN(val) || val < 1) {
      u.send("Error: AC must be at least 1.");
      return;
    }
    sheet.ac = val;
  } else if (traitKey === "speed") {
    const val = parseInt(rhs, 10);
    if (isNaN(val) || val < 0) {
      u.send("Error: Speed must be positive.");
      return;
    }
    sheet.speed = val;
  } else if (traitKey === "hp" || traitKey === "hp_max" || traitKey === "max_hp") {
    const val = parseInt(rhs, 10);
    if (isNaN(val) || val < 1) {
      u.send("Error: Max HP must be at least 1.");
      return;
    }
    sheet.hp.max = val;
    sheet.hp.current = Math.min(sheet.hp.current, val);
  } else if (traitKey === "gold" || traitKey === "gp") {
    const val = parseInt(rhs, 10);
    if (isNaN(val) || val < 0) {
      u.send("Error: Gold must be a non-negative integer.");
      return;
    }
    sheet.gold = val;
  } else {
    u.send(`Error: Unknown sheet trait: "${trait}". Valid traits: class, subclass, species, background, level, ac, speed, hp, gold, ability (e.g. Strength), skill/<name>, save/<ability>.`);
    return;
  }

  await u.db.modify(target.id, "$set", { "data.dnd": sheet });
  u.send(`Set trait '${trait}' to '${rhs}' on ${target.name}'s sheet.`);
}

import { handleList } from "./cg.ts";

addCmd({
  name: "+sheet",
  pattern: /^\+sheet(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Dnd",
  help: `+sheet [<player>]  -- View character sheet.

Switches:
  /list <topic>                    List options for a trait (classes, species, backgrounds, skills).
  /set <trait>=<value>             Modify a trait.

Examples:
  +sheet
  +sheet/list classes
  +sheet/set Strength=15
  +sheet/set skill/perception=proficient
  +sheet/set save/wisdom=yes
  +sheet/set level=3`,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    if (sw === "set") {
      await dndSheetSetExec(u);
    } else if (sw === "list") {
      const rawArg = (u.cmd.args[1] ?? "").trim();
      const handled = handleList(u, rawArg);
      if (!handled) {
        u.send(
          header("LIST ERROR") + "\n" +
          `  Error: Unknown list topic: "${rawArg}".\n` +
          `  Valid topics: %cyclasses%cn, %cyspecies%cn, %cybackgrounds%cn, %cyskills%cn.\n` +
          footer()
        );
      }
    } else {
      await dndSheetExec(u);
    }
  }
});
