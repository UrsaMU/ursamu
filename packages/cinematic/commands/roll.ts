/** +roll and +drama — dice and Drama Points. */
import { addCmd } from "@ursamu/mush";
import { formatManeuvers, formatRoll } from "../src/tables.ts";
import { resolveAttr, resolveSkill } from "../src/resolve.ts";
import { slLabel, successLevels } from "../src/rules.ts";
import { readChar, type ICinChar } from "../src/types.ts";
import { saveChar } from "./chargen.ts";

function d10(): number {
  return 1 + Math.floor(Math.random() * 10);
}

export function resolveRoll(
  roll: number,
  modifiers: number,
) {
  const total = roll + modifiers;
  const sl = successLevels(total);
  return { roll, modifiers, total, sl, label: slLabel(sl) };
}

/** Compute roll total from char — exported for tests. */
export function rollTotal(
  c: ICinChar,
  attr: string,
  skill: string,
  roll: number,
  extra = 0,
): number {
  const a = c.attrs[attr as keyof typeof c.attrs] ?? 0;
  const s = c.skills[skill] ?? 0;
  return roll + a + s + extra;
}

export function buildRollCmds() {
  addCmd({
    name: "+roll",
    pattern: /^\+roll(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+([+-]\d+))?/i,
    lock: "connected",
    category: "Cinematic",
    help: `+roll <attr> [<skill>] [<+/-mod>]  — D10 + attr + skill.

Examples:
  +roll dexterity kung-fu
  +roll intelligence occultism +2`,
    exec: (u) => {
      const c = readChar(u.me.state);
      const attrRaw = (u.cmd.args[0] ?? "").toLowerCase();
      const mod = parseInt(u.cmd.args[2] ?? "0", 10) || 0;
      const attr = resolveAttr(attrRaw);
      if (!attr) {
        u.send("Usage: +roll <attr> [<skill>] [<+/-mod>]");
        return;
      }
      const skillRaw = (u.cmd.args[1] ?? "").trim();
      const m = skillRaw && !/^[+-]/.test(skillRaw)
        ? resolveSkill(skillRaw)
        : null;
      if (m && "error" in m) {
        u.send(`%cr${m.error}%cn`);
        return;
      }
      const skill = m && "slug" in m ? m.slug : "";
      const r = resolveRoll(d10(), rollTotal(c, attr, skill, 0, mod));
      u.send(
        formatRoll(
          u.util.displayName(u.me, u.me),
          attr,
          skill,
          r,
        ),
      );
    },
  });

  addCmd({
    name: "+drama",
    pattern: /^\+drama(?:\/(\S+))?(?:\s+(.*))?$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+drama[/<use>]  — Spend a Drama Point.

Switches:
  (none)     Show remaining Drama Points.
  /heroic    Heroic Feat: +10 to one roll (p.66).
  /okay      I Think I'm Okay: heal half damage (p.67).
  /award <p>=<n>  Grant points (admin+; normal cap 3/week).

Examples:
  +drama
  +drama/heroic
  +drama/award Riley=1`,
    exec: async (u) => {
      const c = readChar(u.me.state);
      const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const left = Math.max(0, c.dramaPoints - c.dramaSpent);
      if (!sw) {
        u.send(`Drama Points: %cy${left}%cn.`);
        return;
      }
      if (left < 1) {
        u.send("%crNo Drama Points left.%cn");
        return;
      }
      if (sw === "award") {
        const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
        if (!(u.me.flags.has("admin") || u.me.flags.has("wizard") ||
          u.me.flags.has("superuser"))) {
          u.send("Permission denied.");
          return;
        }
        const [who, amtRaw] = rest.split("=");
        const target = await u.util.target(u.me, who?.trim() ?? "", true);
        const n = parseInt(amtRaw ?? "", 10);
        if (!target || !n || n < 1) {
          u.send("Usage: +drama/award <player>=<n>");
          return;
        }
        const tc = readChar(target.state);
        tc.dramaPoints += n;
        await u.db.modify(target.id, "$set", {
          "state.cinematic": { ...tc },
        });
        u.send(`${target.name} awarded %cy${n}%cn Drama Points.`);
        u.send(`You gained %cy${n}%cn Drama Points.`, target.id);
        return;
      }
      if (sw === "heroic" || sw === "okay") {
        c.dramaSpent += 1;
        if (sw === "okay") {
          c.damage = Math.max(0, c.damage - Math.ceil(c.damage / 2));
        }
        await saveChar(u, c);
        u.send(
          sw === "heroic"
            ? `Heroic Feat: %cy+10%cn to one roll or damage.`
            : `I Think I'm Okay: damage halved, round in your favor.`,
        );
        return;
      }
      u.send("Unknown use. Try /heroic or /okay.");
    },
  });
}

export function buildManeuversCmd() {
  addCmd({
    name: "+maneuvers",
    pattern: /^maneuvers$|^\+maneuvers$/i,
    lock: "connected",
    category: "Cinematic",
    help: `+maneuvers  — Combat maneuver quick reference.

Examples:
  +maneuvers
  +maneuvers`,
    exec: (u: { send: (m: string) => void }) => {
      u.send(formatManeuvers());
    },
  });
}
