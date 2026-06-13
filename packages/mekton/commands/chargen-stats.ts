import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";
import { chars } from "../schema.ts";
import type { IMektonChar, IMektonStats } from "../schema.ts";
import { derivedStats, maxWounds, skillPointsSpent } from "../derived.ts";
import { STAT_KEYS, validateStat, validateStatPool, checkApproved } from "../validation.ts";

function defaultChar(playerId: string, playerName: string): IMektonChar {
  const stats: IMektonStats = { att: 5, bod: 5, cl: 5, emp: 5, int: 5, luck: 5, ma: 5, ref: 5, tech: 5, edu: 5 };
  const d = derivedStats({ stats } as IMektonChar);
  return {
    id: crypto.randomUUID(),
    playerId,
    playerName,
    stats,
    skills: {},
    lifepath: {
      socialStatus: 0, startingCash: 0, parentStatus: "", familyStanding: "good",
      siblings: [], friends: [], enemies: [], romance: null,
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", personalityTrait: "", valueMost: "", valuedPossession: "", valuedPerson: "" },
      professionalEvents: [],
    },
    charType: null,
    rookieTemplate: null,
    careers: [],
    age: 16,
    equipment: [],
    cash: 0,
    statMethod: null,
    statPointPool: null,
    chargenStatus: "draft",
    wounds: maxWounds({ stats } as IMektonChar),
    stunned: false,
    luckRemaining: stats.luck,
    firstAidApplied: {},
  };
}

addCmd({
  name: "+chargen",
  pattern: /^\+chargen$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen  — View your chargen status and checklist.

Examples:
  +chargen    Show chargen status.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) {
      u.send("No character found. Use %cy+chargen/start%cn to begin.");
      return;
    }
    const d = derivedStats(char);
    const spent = skillPointsSpent(char.skills);
    const statTotal = STAT_KEYS.reduce((sum, k) => sum + char.stats[k], 0);

    const checkRequired = await import("../validation.ts").then(m => m.checkRequired);
    const errors = checkRequired(char);

    const lines = [
      u.util.header("CHARGEN CHECKLIST"),
      `  Character Status: %cy${char.chargenStatus.toUpperCase()}%cn`,
      "",
      // Step 1
      `  ${char.statMethod ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 1: Stat Method%cn`,
      char.statMethod 
        ? `      Method set to %cy${char.statMethod}%cn.` 
        : `      Choose method: %cy+chargen/method <random|concept|cinematic>%cn.`,
      `      (Determines how your primary stats are rolled or allocated)`,
      "",
      // Step 2
      `  ${statTotal >= 20 ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 2: Allocate Stats%cn`,
      statTotal >= 20 
        ? `      Stats allocated (Total: ${statTotal}${char.statPointPool ? `/${char.statPointPool}` : ""}).` 
        : `      Set stats: %cy+chargen/stat <stat>=<value>%cn or %cy+chargen/roll%cn.`,
      `      (ATT, BOD, CL, EMP, INT, LUCK, MA, REF, TECH, EDU - range 2-10)`,
      "",
      // Step 3
      `  ${char.lifepath.parentStatus ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 3: Roll Lifepath%cn`,
      char.lifepath.parentStatus 
        ? `      Lifepath rolled (Standing: ${char.lifepath.familyStanding === "good" ? "Good" : "Bad"}).` 
        : `      Roll lifepath background: %cy+chargen/roll-lifepath%cn.`,
      `      (Generates family background, standing, siblings, friends, and cash)`,
      "",
      // Step 4
      `  ${char.charType ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 4: Character Type%cn`,
      char.charType 
        ? `      Type set to %cy${char.charType}%cn.` 
        : `      Set path: %cy+chargen/type <rookie|professional>%cn.`,
      `      (Rookies are age 16-20 with templates; Professionals 18-30 with careers)`,
      "",
      // Step 5
      `  ${(char.charType === "rookie" && char.rookieTemplate) || (char.charType === "professional" && char.careers.length > 0) ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 5: Profession/Template%cn`,
      char.charType === "rookie"
        ? (char.rookieTemplate ? `      Template: %cy${char.rookieTemplate}%cn.` : `      Choose template: %cy+chargen/template <name>%cn (see %cy+chargen/list templates%cn).`)
        : char.charType === "professional"
        ? (char.careers.length > 0 ? `      Career: %cy${char.careers[0].profession}%cn (${char.careers.length} term(s)).` : `      Add career term: %cy+chargen/career <prof>%cn (see %cy+chargen/list careers%cn).`)
        : `      Choose character type in Step 4 first.`,
      `      (Grants template skill bonuses or career terms depending on your path)`,
      "",
      // Step 6
      `  ${d.skillPoints - spent >= 0 && spent > 0 ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 6: Allocate Skills%cn`,
      `      Budget: ${d.skillPoints} pts  Spent: ${spent} pts  Remaining: %cy${d.skillPoints - spent}%cn.`,
      `      Set skill levels: %cy+chargen/skill <name>=<level>%cn (Hard [H] cap at +5)`,
      "",
      // Step 7
      `  ${char.equipment.length > 0 ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 7: Purchase Gear%cn`,
      `      Cash: ¥${char.cash} remaining. Equipment: ${char.equipment.length} items.`,
      `      Browse: %cy+gear/catalog <category>%cn. Buy: %cy+gear/buy <name>%cn.`,
      "",
      // Step 8
      `  ${errors.length === 0 ? "%cg[X]%cn" : "%cy[ ]%cn"} %cyStep 8: Submission%cn`,
      `      Submit for review: %cy+chargen/submit%cn.`,
      `      (Sends your character sheet to game staff for final review and approval)`,
    ];
    u.send(lines.join("%r"));
  },
});

addCmd({
  name: "+chargen/start",
  pattern: /^\+chargen\/start$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/start  — Begin the character generation process.

Examples:
  +chargen/start    Create a new draft character.`,
  exec: async (u: IUrsamuSDK) => {
    const existing = await chars.findOne({ playerId: u.me.id });
    if (existing && existing.chargenStatus === "approved") {
      u.send("Your character is already approved. Contact staff to restart chargen.");
      return;
    }
    if (existing) {
      u.send("You already have a character in progress. Use %cy+chargen%cn to check status.");
      return;
    }
    const char = defaultChar(u.me.id, u.me.name);
    await chars.create(char);
    u.send(`%cyChargen started!%cn Use %cy+chargen/next%cn for step-by-step guided instructions, or %cy+chargen%cn to view the full checklist.`);
  },
});

addCmd({
  name: "+chargen/method",
  pattern: /^\+chargen\/method\s+(.*)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/method <method>  — Set stat generation method.

Methods: random, concept, cinematic

Examples:
  +chargen/method concept     Point-buy stats (roll 10D10 for pool).
  +chargen/method random      Roll each stat individually (2D10 each, min 2).
  +chargen/method cinematic   Staff-assigned point pool (55/60/65/70/75/80).`,
  exec: async (u: IUrsamuSDK) => {
    const method = u.util.stripSubs(u.cmd.args[0] ?? "").toLowerCase().trim();
    if (!["random", "concept", "cinematic"].includes(method)) {
      u.send("Valid methods: %chrandom%cn, %chconcept%cn, %chcinematic%cn.");
      return;
    }
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }

    let pool: number | null = null;
    if (method === "concept") {
      const rolls = Array.from({ length: 10 }, () => Math.ceil(Math.random() * 10));
      pool = Math.max(40, rolls.reduce((a, b) => a + b, 0));
      u.send(`Concept method: rolled 10D10 = %ch${pool}%cn point pool. Use %ch+chargen/stat <s>=<v>%cn to assign.`);
    } else if (method === "random") {
      u.send(`Random method: use %ch+chargen/roll%cn to roll all stats.`);
    } else {
      u.send(`Cinematic method: a staff member will set your point pool. Standby.`);
    }
    await chars.update({ id: char.id }, { statMethod: method as IMektonChar["statMethod"], statPointPool: pool });
  },
});

addCmd({
  name: "+chargen/stat",
  pattern: /^\+chargen\/stat\s+(.+)=(.+)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/stat <stat>=<value>  — Set a primary stat value.

Stats: att, bod, cl, emp, int, luck, ma, ref, tech, edu

Examples:
  +chargen/stat ref=8    Set Reflexes to 8.
  +chargen/stat bod=6    Set Body Type to 6.`,
  exec: async (u: IUrsamuSDK) => {
    const statRaw = u.util.stripSubs(u.cmd.args[0] ?? "").toLowerCase().trim();
    const valRaw  = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
    const value   = parseInt(valRaw, 10);
    if (!STAT_KEYS.includes(statRaw as typeof STAT_KEYS[number])) {
      u.send(`Unknown stat. Valid: ${STAT_KEYS.join(", ")}.`); return;
    }
    const stat = statRaw as typeof STAT_KEYS[number];
    const check = validateStat(stat, value);
    if (check !== true) { u.send(check); return; }

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }
    if (!char.statMethod) { u.send("Set a stat method first: %ch+chargen/method%cn."); return; }
    if (char.statMethod === "random") { u.send("Use %ch+chargen/roll%cn for random stats."); return; }

    const updated = { ...char.stats, [stat]: value };
    const poolCheck = validateStatPool({ ...char, stats: updated });
    if (poolCheck !== true) { u.send(poolCheck); return; }

    await chars.update({ id: char.id }, { [`stats.${stat}`]: value });
    u.send(`%ch${stat.toUpperCase()}%cn set to ${value}.`);
  },
});

addCmd({
  name: "+chargen/roll",
  pattern: /^\+chargen\/roll$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/roll  — Roll stats randomly (requires random method).

Examples:
  +chargen/roll    Roll all 10 stats using 2D10 each (min 2 per stat, min 40 total).`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }
    if (char.statMethod !== "random") { u.send("You need %ch+chargen/method random%cn first."); return; }

    let stats: Record<string, number>;
    let total = 0;
    do {
      stats = {};
      total = 0;
      for (const key of STAT_KEYS) {
        let val: number;
        do { val = Math.ceil(Math.random() * 10) + Math.ceil(Math.random() * 10); } while (val < 2);
        val = Math.min(10, val);
        stats[key] = val;
        total += val;
      }
    } while (total < 40);

    await chars.update({ id: char.id }, { stats: stats as IMektonStats });
    const line = STAT_KEYS.map((k) => `${k.toUpperCase()}:${stats[k]}`).join("  ");
    u.send(`%cyStats rolled (total: ${total}):%cn%r  ${line}`);
  },
});

addCmd({
  name: "+chargen/next",
  pattern: /^\+chargen\/next$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/next  — Get guided instructions for your next character creation step.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found. Use %cy+chargen/start%cn to begin."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }

    const statTotal = STAT_KEYS.reduce((sum, k) => sum + char.stats[k], 0);
    const d = derivedStats(char);
    const spent = skillPointsSpent(char.skills);

    // Step 1: Stat Method
    if (!char.statMethod) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 1 (STAT METHOD)"),
        "Before setting your attributes, you must choose a stat generation method.",
        "Mekton supports three ways to generate stats:",
        "  %cyrandom%cn    - Roll 2D10 for each of your 10 stats (minimum 2, maximum 10).",
        "  %cyconcept%cn   - Roll 10D10 to roll a point pool, then distribute points manually.",
        "  %cycinematic%cn - Spend points from a staff-assigned point-buy pool.",
        "",
        "Command to set your method:",
        "  %cy+chargen/method <random|concept|cinematic>%cn",
        u.util.footer()
      ].join("%r"));
      return;
    }

    // Step 2: Stats allocation
    if (statTotal < 20) {
      if (char.statMethod === "random") {
        u.send([
          u.util.header("CHARGEN GUIDE: STEP 2 (ROLL STATS)"),
          "You chose the Random method. You will roll 2D10 for each of the 10 stats.",
          "",
          "Command to roll stats:",
          "  %cy+chargen/roll%cn",
          u.util.footer()
        ].join("%r"));
        return;
      } else {
        u.send([
          u.util.header("CHARGEN GUIDE: STEP 2 (ALLOCATE STATS)"),
          `You have a point pool of %cy${char.statPointPool ?? "0"}%cn to spend on stats.`,
          "Set each of the 10 primary stats between 2 and 10:",
          "  ATT (Attractiveness)   BOD (Body Type)   CL (Cool)       EMP (Empathy)",
          "  INT (Intelligence)     LUCK (Luck)       MA (Movement)   REF (Reflexes)",
          "  TECH (Tech Ability)    EDU (Education)",
          "",
          "Command to assign a stat:",
          "  %cy+chargen/stat <stat>=<value>%cn",
          "  (e.g., +chargen/stat ref=8)",
          u.util.footer()
        ].join("%r"));
        return;
      }
    }

    // Step 3: Lifepath
    if (!char.lifepath.parentStatus) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 3 (ROLL LIFEPATH)"),
        "Next, generate your character's backstory and lifepath.",
        "This rolls for family status, social standing, siblings, friends, and starting cash.",
        "",
        "Command to roll lifepath:",
        "  %cy+chargen/roll-lifepath%cn",
        u.util.footer()
      ].join("%r"));
      return;
    }

    // Step 4: Character Type
    if (!char.charType) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 4 (CHARACTER TYPE)"),
        "Choose your character type path:",
        "  %cyrookie%cn      - Play a young pilot (age 16-20) who starts with a template.",
        "  %cyprofessional%cn - Play an experienced pilot (age 18-30) with career terms.",
        "",
        "Command to set character type:",
        "  %cy+chargen/type <rookie|professional>%cn",
        u.util.footer()
      ].join("%r"));
      return;
    }

    // Step 5: Profession/Template
    if (char.charType === "rookie" && !char.rookieTemplate) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 5 (CHOOSE TEMPLATE)"),
        "As a Rookie, you must apply a rookie template.",
        "Templates represent classic anime archetypes, granting skill bonuses and extra starting cash.",
        "Browse templates with: %cy+chargen/list templates%cn",
        "",
        "Command to apply a template:",
        "  %cy+chargen/template <template name>%cn",
        "  (e.g., +chargen/template Anime Hero)",
        u.util.footer()
      ].join("%r"));
      return;
    }

    if (char.charType === "professional" && char.careers.length === 0) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 5 (CAREER TERM)"),
        "As a Professional, you must add at least one career term (2 years per term).",
        "Browse professions and their skills with: %cy+chargen/list careers%cn",
        "",
        "Command to add a career term:",
        "  %cy+chargen/career <profession>%cn",
        "  (e.g., +chargen/career Mechajock/Combat)",
        u.util.footer()
      ].join("%r"));
      return;
    }

    if (char.charType === "professional") {
      const incompleteTermIdx = char.careers.findIndex((c) => c.chosenSkills.length < 5);
      if (incompleteTermIdx !== -1) {
        const termNum = incompleteTermIdx + 1;
        const term = char.careers[incompleteTermIdx];
        const { findProfession } = await import("../professions.ts");
        const prof = findProfession(term.profession);
        const skillStr = prof ? prof.skills.join(", ") : "";
        u.send([
          u.util.header(`CHARGEN GUIDE: STEP 5 (TERM ${termNum} SKILLS)`),
          `For term ${termNum} (${term.profession}), you must choose exactly 5 skills.`,
          `Eligible skills for this profession:`,
          `  ${skillStr}`,
          "",
          "Command to choose skills:",
          `  %cy+chargen/career/skills ${termNum}=<skill1>,<skill2>,<skill3>,<skill4>,<skill5>%cn`,
          u.util.footer()
        ].join("%r"));
        return;
      }
    }

    // Step 6: Allocate Skills
    if (d.skillPoints - spent > 0) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 6 (ALLOCATE SKILLS)"),
        `You have %cy${d.skillPoints - spent}%cn skill points remaining.`,
        "Spend them on any skill from the catalog.",
        "Browse the skill catalog with: %cy+chargen/skills catalog%cn",
        "  Hard [H] skills cost double above +5 and are capped at +5 during creation.",
        "",
        "Command to buy/set a skill:",
        "  %cy+chargen/skill <name>=<level>%cn",
        "  (e.g., +chargen/skill Handgun=4)",
        u.util.footer()
      ].join("%r"));
      return;
    }

    // Step 7: Purchase Gear
    if (char.equipment.length === 0) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 7 (PURCHASE GEAR)"),
        `You have ¥${char.cash} cash. You should purchase starting equipment.`,
        "Browse the gear catalog categories with: %cy+gear/catalog%cn",
        "Browse a specific category with: %cy+gear/catalog <melee|handgun|armor|etc>%cn",
        "",
        "Command to buy an item:",
        "  %cy+gear/buy <item name>%cn",
        "  (e.g., +gear/buy Combat Knife)",
        u.util.footer()
      ].join("%r"));
      return;
    }

    // Step 8: Submission
    const checkRequired = await import("../validation.ts").then(m => m.checkRequired);
    const errors = checkRequired(char);
    if (errors.length > 0) {
      u.send([
        u.util.header("CHARGEN GUIDE: STEP 8 (CORRECT ERRORS)"),
        "Your character sheet has some validation errors to correct before submission:",
        ...errors.map((err) => `  • ${err}`),
        u.util.footer()
      ].join("%r"));
      return;
    }

    u.send([
      u.util.header("CHARGEN GUIDE: STEP 8 (SUBMISSION)"),
      "Your character sheet is complete and ready for submission!",
      "",
      "Command to submit:",
      "  %cy+chargen/submit%cn",
      u.util.footer()
    ].join("%r"));
  },
});
