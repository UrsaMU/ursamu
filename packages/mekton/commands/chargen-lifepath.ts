import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { chars } from "../schema.ts";
import { rollBasicLifepath } from "../lifepath.ts";
import { checkApproved } from "../validation.ts";
import { wrapText } from "../display.ts";

addCmd({
  name: "+chargen/lifepath",
  pattern: /^\+chargen\/lifepath$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/lifepath  — Display your current lifepath.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %cy+chargen/start%cn first."); return; }

    const lp = char.lifepath;
    if (!lp.parentStatus) {
      u.send("Lifepath not yet rolled. Use %cy+chargen/roll-lifepath%cn."); return;
    }

    const lines = [
      u.util.header("LIFEPATH"),
      ` Social Status: ${lp.socialStatus} — ${lp.parentStatus.split(":")[0] ?? ""}`,
      `   Starting Cash: ¥${lp.startingCash}`,
    ];
    lines.push(...wrapText(`Parents: ${lp.parentStatus}`, 78, " "));
    lines.push(` Family Standing: ${lp.familyStanding}`);
    if (lp.familyCrisis) lines.push(...wrapText(`Crisis: ${lp.familyCrisis}`, 78, " "));
    if (lp.familialGoal) lines.push(...wrapText(`Goal: ${lp.familialGoal}`, 78, " "));

    lines.push(``, ` Siblings (${lp.siblings.length}):`);
    for (const s of lp.siblings) {
      lines.push(`   ${s.gender}, ${s.relativeAge}, ${s.feeling}`);
    }
    lines.push(` Friends (${lp.friends.length}):`);
    for (const f of lp.friends) {
      lines.push(`   ${f.gender} — ${f.type}`);
    }
    lines.push(` Enemies (${lp.enemies.length}):`);
    for (const e of lp.enemies) {
      lines.push(...wrapText(`${e.type} — ${e.causeOfHatred} (${e.whoHates} hates; reaction: ${e.reaction})`, 78, "   "));
    }
    if (lp.romance) {
      lines.push(...wrapText(`Romance: ${lp.romance.status}${lp.romance.detail ? " — " + lp.romance.detail : ""}`, 78, " "));
    }

    const a = lp.appearance;
    if (a.hairColor) {
      lines.push(``, ` Appearance:`);
      lines.push(`   Hair: ${a.hairColor}, ${a.hairStyle}   Eyes: ${a.eyeColor}`);
      lines.push(`   Personality: ${a.personalityTrait}`);
      lines.push(...wrapText(`Values: ${a.valueMost}   Possession: ${a.valuedPossession}   Person: ${a.valuedPerson}`, 78, "   "));
    }

    if (char.lifepath.professionalEvents.length > 0) {
      lines.push(``, ` Career Events:`);
      for (const ev of char.lifepath.professionalEvents) {
        lines.push(...wrapText(`Term ${ev.term} (${ev.profession}): ${ev.event} — ${ev.detail}`, 78, "   "));
      }
    }

    u.send(lines.join("%r"));
  },
});

addCmd({
  name: "+chargen/roll-lifepath",
  pattern: /^\+chargen\/roll-lifepath$/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/roll-lifepath  — Auto-roll and record all basic lifepath charts (A1–I).

This rolls your social status, family background, siblings, friends, enemies,
romance, and appearance. Professional career events are rolled separately via
+chargen/career.`,
  exec: async (u: IUrsamuSDK) => {
    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %cy+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }
    if (char.lifepath.parentStatus) {
      u.send("Lifepath already rolled. Use %cy+chargen/lifepath%cn to view it."); return;
    }

    const lp = rollBasicLifepath();
    const updatedLifepath = { ...char.lifepath, ...lp };
    const cash = char.cash + (lp.startingCash ?? 0);
    await chars.update({ id: char.id }, { lifepath: updatedLifepath, cash });

    const lines = [
      "%cyLifepath rolled!%cn",
      ` Social Status: ${lp.socialStatus} (Starting Cash: ¥${lp.startingCash})`,
      ` Parents: ${lp.parentStatus}`,
      ` Family: ${lp.familyStanding}${lp.familyCrisis ? " — " + lp.familyCrisis : ""}`,
      ` Siblings: ${lp.siblings?.length ?? 0}   Friends: ${lp.friends?.length ?? 0}   Enemies: ${lp.enemies?.length ?? 0}`,
      ` Romance: ${lp.romance?.status ?? "uninvolved"}`,
      " Use %cy+chargen/lifepath%cn to see full details.",
    ];
    u.send(lines.join("%r"));
  },
});

addCmd({
  name: "+chargen/lifepath/set",
  pattern: /^\+chargen\/lifepath\/set\s+(.+)=(.*)/i,
  lock: "connected",
  category: "Chargen",
  help: `+chargen/lifepath/set <field>=<value>  — Manually set a lifepath appearance field.

Fields: hairColor, hairStyle, eyeColor, personalityTrait, valueMost, valuedPossession, valuedPerson

Examples:
  +chargen/lifepath/set hairColor=Red
  +chargen/lifepath/set personalityTrait=Friendly, outgoing`,
  exec: async (u: IUrsamuSDK) => {
    const field = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
    const value = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const APPEARANCE_FIELDS = ["hairColor", "hairStyle", "eyeColor", "personalityTrait", "valueMost", "valuedPossession", "valuedPerson"];
    if (!APPEARANCE_FIELDS.includes(field)) {
      u.send(`Valid fields: ${APPEARANCE_FIELDS.join(", ")}.`); return;
    }

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("Use %cy+chargen/start%cn first."); return; }
    if (checkApproved(char)) { u.send("Your character is approved and locked."); return; }

    const updatedLifepath = { ...char.lifepath, appearance: { ...char.lifepath.appearance, [field]: value } };
    await chars.update({ id: char.id }, { lifepath: updatedLifepath });
    u.send(`%cy${field}%cn set to "${value}".`);
  },
});
