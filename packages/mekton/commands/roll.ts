import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { chars } from "../schema.ts";
import { rollInterlock, difficultyLabel, emitRollEvent } from "../roll.ts";
import { STAT_KEYS } from "../validation.ts";
import type { StatKey } from "../schema.ts";

const DIFFICULTY_LABELS: Record<string, number> = {
  easy: 10, average: 15, difficult: 20, "very difficult": 25, "nearly impossible": 30,
};

addCmd({
  name: "+roll",
  pattern: /^\+roll\s+(.*)/i,
  lock: "connected",
  category: "Combat",
  help: `+roll <stat>+<skill>[/<difficulty>]  — Roll an Interlock check.

Difficulty: easy(10), average(15), difficult(20), very difficult(25), nearly impossible(30)
Or pass a number directly: +roll ref+Handgun/20

Examples:
  +roll ref+Handgun           Roll REF + Handgun, no difficulty target.
  +roll ref+Handgun/15        Roll vs Average difficulty (15).
  +roll int+Awareness/Notice  Roll INT + Awareness/Notice.`,
  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").trim();

    // Parse: stat+skill[/difficulty]
    const match = raw.match(/^([a-z]+)\+([^/]+?)(?:\/(.+))?$/i);
    if (!match) {
      u.send("Usage: %cy+roll <stat>+<skill>[/<difficulty>]%cn"); return;
    }
    const [, statRaw, skillRaw, diffRaw] = match;
    const statKey = statRaw.toLowerCase().trim() as StatKey;

    if (!STAT_KEYS.includes(statKey)) {
      u.send(`Unknown stat "${statRaw}". Valid: ${STAT_KEYS.join(", ")}.`); return;
    }

    let difficulty: number | undefined;
    if (diffRaw) {
      const diffLabel = diffRaw.toLowerCase().trim();
      difficulty = DIFFICULTY_LABELS[diffLabel] ?? parseInt(diffRaw, 10);
      if (isNaN(difficulty)) { u.send(`Unknown difficulty "${diffRaw}".`); return; }
    }

    const char = await chars.findOne({ playerId: u.me.id });
    if (!char) { u.send("No character found. Use %cy+chargen/start%cn first."); return; }

    const statValue  = char.stats[statKey];
    const skillName  = skillRaw.trim();
    const skillValue = char.skills[skillName] ?? 0;

    const result = rollInterlock(statValue, skillValue);
    const success = difficulty !== undefined ? result.total >= difficulty : undefined;

    const critLabel = result.critical === "success" ? " %cyCRITICAL SUCCESS!%cn" : result.critical === "failure" ? " %crCRITICAL FAILURE!%cn" : "";
    const diffLine = difficulty !== undefined
      ? `  vs %cy${difficultyLabel(difficulty)}%cn — ${success ? "%cgSUCCESS%cn" : "%crFAIL%cn"}`
      : "";

    const lines = [
      `%cy+roll%cn ${statKey.toUpperCase()}(${statValue}) + ${skillName}(${skillValue}) + 1D10`,
      `  Roll: ${result.chainRolls.join(" → ")}   Total: %cy${result.total}%cn${critLabel}${diffLine}`,
    ];
    u.send(lines.join("%r"));

    const summary = `${u.me.name} rolled ${statKey.toUpperCase()}(${statValue})+${skillName}(${skillValue})+d10 = ${result.total}${difficulty ? ` vs ${difficulty} — ${success ? "SUCCESS" : "FAIL"}` : ""}.`;
    emitRollEvent({
      playerId: u.me.id,
      playerName: u.me.name ?? "Unknown",
      roomId: u.me.location ?? u.me.id,
      statName: statKey,
      skillName,
      statValue,
      skillValue,
      roll: result.d10,
      total: result.total,
      difficulty,
      success,
      critical: result.critical,
      summary,
    });
  },
});
