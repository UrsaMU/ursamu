import { addCmd } from "jsr:@ursamu/ursamu";
import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";
import { chars } from "../schema.ts";
import { derivedStats, skillPointsSpent } from "../derived.ts";
import { SKILL_CATALOG } from "../catalog.ts";
import { validateSkillName, validateSkillLevel, validateSkillPool, checkApproved } from "../validation.ts";

addCmd({
  name: "+chargen/skill",
  pattern: /^\+chargen\/skill\s+(.+)=(\d+)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/skill <name>=<level>  — Set a skill to a specific level.

Hard [H] skills are capped at +5 at chargen.
Cost: 1 pt/level to +5, then 2 pts/level above +5.

Examples:
  +chargen/skill Handgun=4          Set Handgun to +4.
  +chargen/skill Mecha Piloting=5   Set Mecha Piloting (Hard) to +5.
  +chargen/skill Expert: Tactics=3  Set Expert skill with custom topic.`,
  exec: async (u: IUrsamuSDK) => {
    const nameRaw  = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const levelRaw = parseInt(u.util.stripSubs(u.cmd.args[1] ?? "").trim(), 10);

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %cy+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }

    const nameResult = validateSkillName(nameRaw);
    if (nameResult instanceof Error) { u.send(nameResult.message); return; }
    const skillName = nameResult;

    const levelCheck = validateSkillLevel(skillName, levelRaw, char);
    if (levelCheck !== true) { u.send(levelCheck); return; }

    const updatedSkills = { ...char.skills, [skillName]: levelRaw };
    const poolCheck = validateSkillPool({ ...char, skills: updatedSkills });
    if (poolCheck !== true) { u.send(poolCheck); return; }

    await chars.update({ id: char.id }, { [`skills.${skillName}`]: levelRaw });
    const d = derivedStats(char);
    const newSpent = skillPointsSpent(updatedSkills);
    u.send(`%cy${skillName}%cn set to +${levelRaw}. Points remaining: ${d.skillPoints - newSpent}.`);
  },
});

addCmd({
  name: "+chargen/skills",
  pattern: /^\+chargen\/skills(?:\s+(.*))?/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/skills [<filter>]  — List skill points and current selections.

Examples:
  +chargen/skills          Show all skills and point budget.
  +chargen/skills ref      Show only REF-linked skills.
  +chargen/skills catalog  Show the full skill catalog.`,
  exec: async (u: IUrsamuSDK) => {
    const filter = u.util.stripSubs(u.cmd.args[0] ?? "").toLowerCase().trim();

    if (filter === "catalog") {
      const lines = [
        u.util.header("SKILL CATALOG"),
        ...SKILL_CATALOG.map((s) => `  ${s}`),
        "%cyAlso valid: Expert: <topic>, Know Language: <lang>%cn",
      ];
      u.send(lines.join("%r"));
      return;
    }

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %cy+chargen/start%cn first."); return; }

    const d = derivedStats(char);
    const spent = skillPointsSpent(char.skills);
    const lines = [
      u.util.header("SKILLS"),
      ` Budget: ${d.skillPoints}   Spent: ${spent}   Remaining: %cy${d.skillPoints - spent}%cn`,
      "",
    ];

    const entries = Object.entries(char.skills).filter(([, v]) => v > 0);
    if (entries.length === 0) {
      lines.push("  No skills set yet.");
    } else {
      for (const [sk, lv] of entries.sort(([a], [b]) => a.localeCompare(b))) {
        if (filter && !sk.toLowerCase().includes(filter)) continue;
        const cost = lv <= 5 ? lv : 5 + (lv - 5) * 2;
        lines.push(`  ${u.util.ljust(sk, 35)} +${lv}  (${cost} pts)`);
      }
    }
    u.send(lines.join("%r"));
  },
});
