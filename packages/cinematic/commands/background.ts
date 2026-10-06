/** +background, +damage, +xp — sheet flavor and bookkeeping. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { lifePoints } from "../src/rules.ts";
import { readChar, type ICinChar } from "../src/types.ts";
import { saveChar } from "./chargen.ts";
import { isStaff } from "./staff.ts";

const FIELDS = [
  "concept",
  "form",
  "effects",
  "conditions",
  "weaknesses",
] as const;

type Field = (typeof FIELDS)[number];

const KEY: Record<Field, keyof ICinChar> = {
  concept: "concept",
  form: "currentForm",
  effects: "activeEffects",
  conditions: "conditions",
  weaknesses: "weaknesses",
};

export function buildBackgroundCmds() {
  addCmd({
    name: "+background",
    pattern: /^\+background\s+(\S+)\s*=\s*(.+)/i,
    lock: "connected",
    category: "Cinematic",
    help: `+background <field>=<value>  — Set sheet flavor text.

Fields:
  concept, form, effects, conditions, weaknesses

Contacts, Status, Rank, etc are qualities — use +quality <slug>=<level>:<org>.

Examples:
  +background concept=Newest Slayer in town
  +background weaknesses=Sunlight, invitation`,
    exec: async (u) => {
      const raw = readChar(u.me.state);
      if (raw.status === "approved") {
        u.send("Character is locked.");
        return;
      }
      const field = u.util.stripSubs(u.cmd.args[0])
        .trim().toLowerCase() as Field;
      const value = u.util.stripSubs(u.cmd.args[1]).trim().slice(0, 60);
      if (!FIELDS.includes(field)) {
        u.send(`%crUnknown field%cn. Try: ${FIELDS.join(", ")}`);
        return;
      }
      const c = raw as unknown as Record<string, string>;
      c[KEY[field]] = value;
      await saveChar(u, raw);
      u.send(`${field} set.`);
    },
  });

  addCmd({
    name: "+damage",
    pattern: /^\+damage\s+([+-]?\d+)/i,
    lock: "connected",
    category: "Cinematic",
    help: `+damage <n>  — Apply (or heal with a negative) Life Point damage.

Examples:
  +damage 12
  +damage -5`,
    exec: async (u) => {
      const c = readChar(u.me.state);
      const n = parseInt(u.cmd.args[0], 10);
      const max = lifePoints(c);
      c.damage = Math.min(
        max + 10,
        Math.max(0, (c.damage ?? 0) + n),
      );
      await saveChar(u, c);
      const cur = Math.max(0, max - c.damage);
      u.send(`Life Points: %cy${cur}%cn / ${max}.`);
    },
  });

  addCmd({
    name: "+xp",
    pattern: /^\+xp\s+(\S+)\s*=\s*([+-]?\d+)/i,
    lock: "connected",
    category: "Cinematic",
    help: `+xp <player>=<n>  — Grant (or revoke) experience points (admin+).

Examples:
  +xp Riley=5
  +xp Riley=-2`,
    exec: async (u) => {
      if (!isStaff(u)) {
        u.send("Permission denied.");
        return;
      }
      const target = await u.util.target(
        u.me,
        u.cmd.args[0].trim(),
        true,
      );
      if (!target) {
        u.send("No such player.");
        return;
      }
      const n = parseInt(u.cmd.args[1], 10);
      const c = readChar(target.state);
      c.xpEarned = Math.max(0, (c.xpEarned ?? 0) + n);
      await u.db.modify(target.id, "$set", {
        "state.cinematic": { ...c },
      });
      u.send(`${target.name}: ${c.xpEarned} XP earned.`);
      u.send(`You gain %cy${n}%cn XP.`, target.id);
    },
  });
}
