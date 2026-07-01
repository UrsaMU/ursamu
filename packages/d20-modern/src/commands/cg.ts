import { addCmd, type IUrsamuSDK, header, footer } from "@ursamu/ursamu";
import {
  type ModernAbility,
  type ModernSkill,
  MODERN_ABILITIES,
  MODERN_SKILLS,
  getAbilityMod,
  type ModernSheet
} from "../stats/modern_sheet.ts";
import occupationsData from "../../resources/occupations.json" with { type: "json" };
import classesData from "../../resources/classes.json" with { type: "json" };
import featsData from "../../resources/feats.json" with { type: "json" };
import talentsData from "../../resources/talents.json" with { type: "json" };

export interface CgState {
  stage: number;
  class: string;
  occupation: string;
  abilities: Record<ModernAbility, number>;
  skills: ModernSkill[];
  feats: string[];
  talent: string;
  allegiances: string[];
}

const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16
};

export const OCCUPATIONS: Record<string, { skills: ModernSkill[]; wealth: number }> = occupationsData;
export const CLASSES: Record<string, { skills: ModernSkill[]; count: number; hp: number; rep: number }> = classesData;
export const FEATS: string[] = featsData;
export const TALENTS: Record<string, string[]> = talentsData;

export function getCgState(u: IUrsamuSDK): CgState {
  const defaults: CgState = {
    stage: 1,
    class: "",
    occupation: "",
    abilities: {
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8
    },
    skills: [],
    feats: [],
    talent: "",
    allegiances: []
  };
  return { ...defaults, ...(u.me.state.d20_modern_cg ?? {}) };
}

async function saveCgState(u: IUrsamuSDK, state: CgState) {
  await u.db.modify(u.me.id, "$set", { "state.d20_modern_cg": state });
}

function calculatePointBuy(state: CgState): number {
  let cost = 0;
  for (const ab of MODERN_ABILITIES) {
    cost += POINT_BUY_COSTS[state.abilities[ab]] ?? 0;
  }
  return cost;
}

function showStage1(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 1: STARTING OCCUPATION"));
  u.send(" Choose a starting occupation for your Hero.");
  u.send(" To see occupations: %ch+cg/list occupations%cn");
  u.send(" To set: %ch+cg/set occupation=<name>%cn");
  if (state.occupation) {
    u.send(` %cyCurrent Choice:%cn ${state.occupation.toUpperCase()}`);
  }
  u.send(footer());
}

function showStage2(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 2: HERO BASE CLASS"));
  u.send(" Choose a Hero Base Class.");
  u.send(" Classes: Strong, Fast, Tough, Smart, Dedicated, Charismatic");
  u.send(" To set: %ch+cg/set class=<name>%cn");
  if (state.class) {
    u.send(` %cyCurrent Choice:%cn ${state.class.toUpperCase()}`);
  }
  u.send(footer());
}

function showStage3(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 3: ABILITY SCORES (POINT BUY)"));
  u.send(" Distribute 25 points. Abilities start at 8 (cost 0).");
  u.send(" Cost Table: 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=6, 15=8, 16=10...");
  u.send(" To set: %ch+cg/set <ability>=<score>%cn");
  const cost = calculatePointBuy(state);
  u.send(` %cyPoints Spent:%cn ${cost} / 25`);
  u.send(` STR: ${state.abilities.strength}   DEX: ${state.abilities.dexterity}   CON: ${state.abilities.constitution}`);
  u.send(` INT: ${state.abilities.intelligence}   WIS: ${state.abilities.wisdom}   CHA: ${state.abilities.charisma}`);
  u.send(footer());
}

function showStage4(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 4: TALENT SELECTION"));
  const cls = state.class.toLowerCase();
  const list = TALENTS[cls] ?? [];
  u.send(" Choose a starting talent from your Hero Class talent tree.");
  u.send(` Available for ${state.class.toUpperCase()}: ${list.join(", ")}`);
  u.send(" To set: %ch+cg/set talent=<talent_name>%cn");
  if (state.talent) {
    u.send(` %cyCurrent Choice:%cn ${state.talent.toUpperCase()}`);
  }
  u.send(footer());
}

function showStage5(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 5: SKILL SELECTION"));
  const clsData = CLASSES[state.class.toLowerCase()];
  const occData = OCCUPATIONS[state.occupation.toLowerCase()];
  const intMod = getAbilityMod(state.abilities.intelligence);
  const totalAllowed = clsData ? clsData.count + intMod : 0;

  u.send(` Choose skill proficiencies. Your class allows %ch${totalAllowed}%cn skills.`);
  u.send(" Occupation skills are automatically granted (indicated with [X]).");
  u.send(" To toggle a skill: %ch+cg/set skill=<skill_name>%cn");
  u.send(" To list skills: %ch+cg/list skills%cn");

  const list: string[] = [];
  const occSkills = occData?.skills ?? [];
  for (const sk of MODERN_SKILLS) {
    const isOcc = occSkills.includes(sk);
    const isChosen = state.skills.includes(sk);
    const box = (isOcc || isChosen) ? "%cg[X]%cn" : "%cx[ ]%cn";
    const label = sk.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    list.push(`  ${box} ${label}`);
  }
  u.send(list.join("\n"));
  u.send(footer());
}

function showStage6(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 6: STARTING FEATS"));
  u.send(" Select 1 starting feat.");
  u.send(" Simple Weapons Proficiency is automatically granted.");
  u.send(" To toggle a feat: %ch+cg/set feat=<feat_name>%cn");
  u.send(" To list feats: %ch+cg/list feats%cn");
  u.send(` %cyCurrent Choice:%cn ${state.feats.join(", ") || "None"}`);
  u.send(footer());
}

function showStage7(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 7: ALLEGIANCES"));
  u.send(" Select up to 3 allegiances (e.g. Good, Lawful, Department-7).");
  u.send(" Add an allegiance with: %ch+cg/set allegiance=<name>%cn");
  u.send(" Clear all with: %ch+cg/set allegiance=clear%cn");
  u.send(` %cyCurrent Choice:%cn ${state.allegiances.join(", ") || "None"}`);
  u.send(footer());
}

function showStage8(u: IUrsamuSDK, state: CgState) {
  u.send(header("STAGE 8: REVIEW & SUBMIT"));
  u.send(" Review your character data:");
  u.send(` Occupation: ${state.occupation.toUpperCase()}`);
  u.send(` Class: ${state.class.toUpperCase()}`);
  u.send(` Abilities: STR ${state.abilities.strength}, DEX ${state.abilities.dexterity}, CON ${state.abilities.constitution}, INT ${state.abilities.intelligence}, WIS ${state.abilities.wisdom}, CHA ${state.abilities.charisma}`);
  u.send(` Talent: ${state.talent.toUpperCase()}`);
  u.send(` Skills: ${state.skills.join(", ")}`);
  u.send(` Feats: Simple Weapons Proficiency, ${state.feats.join(", ")}`);
  u.send(` Allegiances: ${state.allegiances.join(", ") || "None"}`);
  u.send(" If correct, finalize with: %ch+cg/submit%cn");
  u.send(footer());
}

export async function cgSetExec(u: IUrsamuSDK, state: CgState, args: string) {
  const parts = args.split("=");
  const key = parts[0].trim().toLowerCase();
  const val = parts[1]?.trim().toLowerCase() ?? "";

  if (state.stage === 1 && key === "occupation") {
    if (!OCCUPATIONS[val]) {
      u.send(`Invalid occupation. Choose from: ${Object.keys(OCCUPATIONS).join(", ")}`);
      return;
    }
    state.occupation = val;
  } else if (state.stage === 2 && key === "class") {
    if (!CLASSES[val]) {
      u.send(`Invalid class. Choose from: ${Object.keys(CLASSES).join(", ")}`);
      return;
    }
    state.class = val;
  } else if (state.stage === 3 && MODERN_ABILITIES.includes(key as ModernAbility)) {
    const num = parseInt(val, 10);
    if (!POINT_BUY_COSTS[num] && num !== 8) {
      u.send("Ability scores must be between 8 and 18.");
      return;
    }
    const tempAb = { ...state.abilities, [key]: num };
    let tempCost = 0;
    for (const ab of MODERN_ABILITIES) {
      tempCost += POINT_BUY_COSTS[tempAb[ab]] ?? 0;
    }
    if (tempCost > 25) {
      u.send(`Cannot set ${key} to ${num}. It would exceed the 25 point budget.`);
      return;
    }
    state.abilities[key as ModernAbility] = num;
  } else if (state.stage === 4 && key === "talent") {
    const cls = state.class.toLowerCase();
    const list = TALENTS[cls] ?? [];
    if (!list.includes(val)) {
      u.send(`Invalid talent. Select from: ${list.join(", ")}`);
      return;
    }
    state.talent = val;
  } else if (state.stage === 5 && key === "skill") {
    const skVal = val.replace(/\s+/g, "_") as ModernSkill;
    if (!MODERN_SKILLS.includes(skVal)) {
      u.send("Invalid skill.");
      return;
    }
    const occSkills = OCCUPATIONS[state.occupation.toLowerCase()]?.skills ?? [];
    if (occSkills.includes(skVal)) {
      u.send("Occupation skills cannot be toggled.");
      return;
    }
    const idx = state.skills.indexOf(skVal);
    if (idx !== -1) {
      state.skills.splice(idx, 1);
    } else {
      const clsData = CLASSES[state.class.toLowerCase()];
      const intMod = getAbilityMod(state.abilities.intelligence);
      const totalAllowed = clsData ? clsData.count + intMod : 0;
      if (state.skills.length >= totalAllowed) {
        u.send(`You can only choose up to ${totalAllowed} skills.`);
        return;
      }
      state.skills.push(skVal);
    }
  } else if (state.stage === 6 && key === "feat") {
    const ftVal = val.replace(/\s+/g, "_");
    if (!FEATS.includes(ftVal)) {
      u.send("Invalid feat.");
      return;
    }
    const idx = state.feats.indexOf(ftVal);
    if (idx !== -1) {
      state.feats.splice(idx, 1);
    } else {
      if (state.feats.length >= 1) {
        u.send("You can only select 1 feat at this stage.");
        return;
      }
      state.feats.push(ftVal);
    }
  } else if (state.stage === 7 && key === "allegiance") {
    if (val === "clear") {
      state.allegiances = [];
    } else {
      if (state.allegiances.length >= 3) {
        u.send("You can only have up to 3 allegiances.");
        return;
      }
      if (state.allegiances.includes(val)) {
        u.send("You already have this allegiance.");
        return;
      }
      state.allegiances.push(val);
    }
  } else {
    u.send("Invalid trait for this stage.");
    return;
  }

  await saveCgState(u, state);
  u.send(`Set ${key} to ${val}.`);
}

export function cgListExec(u: IUrsamuSDK, topic: string) {
  const t = topic.toLowerCase().trim();
  if (t === "occupations") {
    u.send(header("OCCUPATIONS"));
    for (const key of Object.keys(OCCUPATIONS)) {
      const data = OCCUPATIONS[key];
      u.send(` %cy${key.toUpperCase()}%cn (Wealth +${data.wealth})`);
      u.send(`   Skills: ${data.skills.join(", ")}`);
    }
    u.send(footer());
  } else if (t === "skills") {
    u.send(header("SKILLS"));
    u.send(" " + MODERN_SKILLS.join(", "));
    u.send(footer());
  } else if (t === "feats") {
    u.send(header("FEATS"));
    u.send(" " + FEATS.join(", "));
    u.send(footer());
  } else {
    u.send("Available lists: occupations, skills, feats");
  }
}

export async function cgSubmitExec(u: IUrsamuSDK, state: CgState) {
  if (state.stage !== 8) {
    u.send("You must complete all stages before submitting.");
    return;
  }

  const occData = OCCUPATIONS[state.occupation.toLowerCase()];
  const clsData = CLASSES[state.class.toLowerCase()];

  const conMod = getAbilityMod(state.abilities.constitution);
  const startHp = (clsData?.hp ?? 6) + conMod;
  const wealthRoll = Math.floor(Math.random() * 4) + Math.floor(Math.random() * 4) + 2; // 2d4
  const startWealth = wealthRoll + (occData?.wealth ?? 0);

  const sheet: ModernSheet = {
    class: state.class.charAt(0).toUpperCase() + state.class.slice(1) + " Hero",
    level: 1,
    occupation: state.occupation.charAt(0).toUpperCase() + state.occupation.slice(1),
    abilities: state.abilities,
    skills: [...state.skills, ...(occData?.skills ?? [])],
    feats: ["simple_weapons_proficiency", ...state.feats],
    talent: state.talent,
    allegiances: state.allegiances,
    hp: { max: startHp, current: startHp },
    wealth: startWealth,
    reputation: clsData?.rep ?? 0,
    actionPoints: 5
  };

  await u.db.modify(u.me.id, "$set", { "state.d20_modern": sheet });
  await u.db.modify(u.me.id, "$unset", { "state.d20_modern_cg": "" });
  u.send("Character generation completed successfully! Type %ch+sheet%cn to view.");
}

export async function modernCgExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const args = (u.cmd.args[1] ?? "").trim();
  const state = getCgState(u);

  if (sw === "reset") {
    await u.db.modify(u.me.id, "$unset", { "state.d20_modern_cg": "" });
    u.send("Character generation state reset.");
    return;
  }

  if (sw === "list") {
    cgListExec(u, args);
    return;
  }

  if (sw === "set") {
    await cgSetExec(u, state, args);
    return;
  }

  if (sw === "next") {
    if (state.stage === 1 && !state.occupation) {
      u.send("Please select an occupation first.");
      return;
    }
    if (state.stage === 2 && !state.class) {
      u.send("Please select a class first.");
      return;
    }
    if (state.stage === 3) {
      const cost = calculatePointBuy(state);
      if (cost !== 25) {
        u.send(`You must spend exactly 25 points (currently spent: ${cost}).`);
        return;
      }
    }
    if (state.stage === 4 && !state.talent) {
      u.send("Please select a starting talent first.");
      return;
    }
    if (state.stage < 8) {
      state.stage += 1;
      await saveCgState(u, state);
    }
  } else if (sw === "back") {
    if (state.stage > 1) {
      state.stage -= 1;
      await saveCgState(u, state);
    }
  } else if (sw === "submit") {
    await cgSubmitExec(u, state);
    return;
  }

  // Show status for current stage
  switch (state.stage) {
    case 1: showStage1(u, state); break;
    case 2: showStage2(u, state); break;
    case 3: showStage3(u, state); break;
    case 4: showStage4(u, state); break;
    case 5: showStage5(u, state); break;
    case 6: showStage6(u, state); break;
    case 7: showStage7(u, state); break;
    case 8: showStage8(u, state); break;
  }
}

addCmd({
  name: "+cg",
  pattern: /^\+cg(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "D20 Modern",
  help: `+cg [<switch>] [<args>]

Switches:
  /set    Set a value in the current stage.
  /list   List options (occupations, skills, feats).
  /next   Advance to the next stage.
  /back   Go back to the previous stage.
  /reset  Reset current character generation state.
  /submit Finalize character sheet.

Examples:
  +cg
  +cg/set class=strong
  +cg/next`,
  exec: modernCgExec
});
