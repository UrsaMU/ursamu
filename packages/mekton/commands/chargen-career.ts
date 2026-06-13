import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";
import { chars } from "../schema.ts";
import type { ICareerTerm } from "../schema.ts";
import { PROFESSIONS, findProfession } from "../professions.ts";
import { ROOKIE_TEMPLATES, findTemplate } from "../templates.ts";
import { checkApproved } from "../validation.ts";
import { wrapText } from "../display.ts";

addCmd({
  name: "+chargen/type",
  pattern: /^\+chargen\/type\s+(.*)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/type <rookie|professional>  — Set character type.

Examples:
  +chargen/type rookie          Play a rookie character (age 16–20).
  +chargen/type professional    Play a professional (career terms, age 18–30).`,
  exec: async (u: IUrsamuSDK) => {
    const type = u.util.stripSubs(u.cmd.args[0] ?? "").toLowerCase().trim();
    if (type !== "rookie" && type !== "professional") {
      u.send("Type must be %chrookie%cn or %chprofessional%cn."); return;
    }
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }

    await chars.update({ id: char.id }, { charType: type });
    if (type === "rookie") {
      u.send(`Character type set to %chRookie%cn. Use %ch+chargen/list templates%cn to see templates.`);
    } else {
      u.send(`Character type set to %chProfessional%cn. Use %ch+chargen/list careers%cn to see professions.`);
    }
  },
});

addCmd({
  name: "+chargen/list",
  pattern: /^\+chargen\/list(?:\s+(.*))?/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/list <templates|careers>  — List rookie templates or careers/professions.

Examples:
  +chargen/list templates
  +chargen/list careers`,
  exec: (u: IUrsamuSDK) => {
    const topic = u.util.stripSubs(u.cmd.args[0] ?? "").toLowerCase().trim();
    if (!topic) {
      u.send("Usage: %ch+chargen/list <templates|careers>%cn");
      return;
    }
    if (topic === "templates" || topic === "template" || topic === "rookie") {
      const lines = [u.util.header("ROOKIE TEMPLATES")];
      for (const t of ROOKIE_TEMPLATES) {
        lines.push(u.util.ljust(`  %cy${t.name}%cn (+¥${t.bonusCash})`, 78));
        const chunks = Object.entries(t.skillBonuses).map(([k, v]) => `${k} +${v}`);
        for (let i = 0; i < chunks.length; i += 3) {
          const slice = chunks.slice(i, i + 3);
          const rowStr = slice.map((item, idx) => {
            if (idx === slice.length - 1) return item;
            const pad = 24 - item.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;
            return item + " ".repeat(Math.max(2, pad));
          }).join("");
          lines.push(u.util.ljust("    " + rowStr, 78));
        }
      }
      lines.push(u.util.footer());
      u.send(lines.join("%r"));
      return;
    }
    if (topic === "careers" || topic === "career" || topic === "professions" || topic === "profession" || topic === "professional") {
      const lines = [u.util.header("PROFESSIONS")];
      for (const p of PROFESSIONS) {
        lines.push(u.util.ljust(`  %cy${p.name}%cn${p.dangerous ? " %cr[D]%cn" : ""}`, 78));
        const chunks = p.skills;
        for (let i = 0; i < chunks.length; i += 3) {
          const slice = chunks.slice(i, i + 3);
          const rowStr = slice.map((item, idx) => {
            if (idx === slice.length - 1) return item;
            const pad = 24 - item.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;
            return item + " ".repeat(Math.max(2, pad));
          }).join("");
          lines.push(u.util.ljust("    " + rowStr, 78));
        }
      }
      lines.push(u.util.footer());
      u.send(lines.join("%r"));
      return;
    }
    u.send("Usage: %ch+chargen/list <templates|careers>%cn");
  },
});

addCmd({
  name: "+chargen/template",
  pattern: /^\+chargen\/template\s+(.*)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/template <name>  — Choose and apply a rookie template.
 
Examples:
  +chargen/template Anime Hero    Apply the Anime Hero template.`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }
    if (char.charType !== "rookie") { u.send("Use %ch+chargen/type rookie%cn first."); return; }

    const tpl = findTemplate(name);
    if (!tpl) { u.send(`Unknown template "${name}". Use %ch+chargen/list templates%cn.`); return; }

    // Revert old template bonuses first
    const oldTpl = char.rookieTemplate ? findTemplate(char.rookieTemplate) : null;
    const skills = { ...char.skills };
    if (oldTpl) {
      for (const [sk, bonus] of Object.entries(oldTpl.skillBonuses)) {
        skills[sk] = Math.max(0, (skills[sk] ?? 0) - bonus);
        if (skills[sk] === 0) delete skills[sk];
      }
    }
    // Apply new template bonuses
    for (const [sk, bonus] of Object.entries(tpl.skillBonuses)) {
      skills[sk] = (skills[sk] ?? 0) + bonus;
    }
    const cash = char.cash + tpl.bonusCash - (oldTpl?.bonusCash ?? 0);

    await chars.update({ id: char.id }, { rookieTemplate: tpl.name, skills, cash });
    u.send(`%chTemplate: ${tpl.name}%cn applied. Bonus cash: +¥${tpl.bonusCash}.`);
  },
});



addCmd({
  name: "+chargen/career",
  pattern: /^\+chargen\/career\s+(.*)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/career <profession>  — Add a career term (2 years).

Dangerous professions trigger a lifepath event roll.
Each term grants +2D10¥ equipment bonus.

Examples:
  +chargen/career Mechajock/Combat    Add a Mechajock term.`,
  exec: async (u: IUrsamuSDK) => {
    const profName = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }
    if (char.charType !== "professional") { u.send("Use %ch+chargen/type professional%cn first."); return; }
    if (char.careers.length >= 7) { u.send("Maximum 7 career terms (age 30)."); return; }

    const age = 16 + char.careers.length * 2;
    if (age < 18) { u.send(`You must be at least 18 to begin a career term. Current age: ${age}.`); return; }
    if (age >= 30) { u.send("Maximum age reached (30). No more career terms."); return; }

    const prof = findProfession(profName);
    if (!prof) { u.send(`Unknown profession. Use %ch+chargen/list careers%cn.`); return; }

    const bonus = Math.ceil(Math.random() * 10) * 2 + Math.ceil(Math.random() * 10) * 2;
    const term: ICareerTerm = { profession: prof.name, dangerous: prof.dangerous, chosenSkills: [], equipmentBonus: bonus };
    const careers = [...char.careers, term];
    await chars.update({ id: char.id }, { careers, age: age + 2 });
    u.send(`%chTerm ${char.careers.length + 1}:%cn ${prof.name} (age ${age}–${age + 2}). Equipment bonus: +¥${bonus}.%r  Now choose 5 skills: %ch+chargen/career/skills ${char.careers.length + 1}=<skill1>,<skill2>,...%cn`);
  },
});

addCmd({
  name: "+chargen/career/skills",
  pattern: /^\+chargen\/career\/skills\s+(\d+)=(.*)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/career/skills <term>=<skill1>,<skill2>,...  — Choose 5 skills for a career term.

Examples:
  +chargen/career/skills 1=Mecha Piloting,Mecha Gunnery,Handgun,Awareness/Notice,Mecha Melee`,
  exec: async (u: IUrsamuSDK) => {
    const termNum = parseInt(u.util.stripSubs(u.cmd.args[0] ?? "").trim(), 10);
    const skillList = u.util.stripSubs(u.cmd.args[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }

    const idx = termNum - 1;
    if (idx < 0 || idx >= char.careers.length) { u.send(`Invalid term number. You have ${char.careers.length} term(s).`); return; }
    const term = char.careers[idx];
    const prof = findProfession(term.profession);
    if (!prof) { u.send("Career profession data not found."); return; }

    if (skillList.length !== 5) { u.send("You must choose exactly 5 skills."); return; }
    for (const sk of skillList) {
      if (!prof.skills.some((s) => s.toLowerCase() === sk.toLowerCase())) {
        u.send(`"${sk}" is not in ${prof.name}'s skill list:%r  ${prof.skills.join(", ")}`); return;
      }
    }

    // Apply +1 to each chosen skill (career bonuses can exceed [H] cap)
    const skills = { ...char.skills };
    for (const sk of skillList) {
      const canonical = prof.skills.find((s) => s.toLowerCase() === sk.toLowerCase())!;
      skills[canonical] = (skills[canonical] ?? 0) + 1;
    }
    const careers = [...char.careers];
    careers[idx] = { ...term, chosenSkills: skillList };
    await chars.update({ id: char.id }, { careers, skills });
    u.send(`%chTerm ${termNum} skills set.%cn Each chosen skill gained +1.`);
  },
});

addCmd({
  name: "+chargen/career/remove",
  pattern: /^\+chargen\/career\/remove$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/career/remove  — Remove the last career term.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %ch+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }
    if (char.careers.length === 0) { u.send("No career terms to remove."); return; }

    const last = char.careers[char.careers.length - 1];
    const skills = { ...char.skills };
    for (const sk of last.chosenSkills) {
      skills[sk] = Math.max(0, (skills[sk] ?? 0) - 1);
      if (skills[sk] === 0) delete skills[sk];
    }
    const careers = char.careers.slice(0, -1);
    const age = 16 + careers.length * 2;
    await chars.update({ id: char.id }, { careers, skills, age });
    u.send(`Removed term: %ch${last.profession}%cn. Age reset to ${age}.`);
  },
});
