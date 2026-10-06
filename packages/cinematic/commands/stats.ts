/** +stat, +skill, +quality, +drawback — build the sheet. */
import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { qualityDef, skillDef, templateForQuality } from "../src/data.ts";
import {
  resolveAttr,
  resolveSkill,
  slugify,
} from "../src/resolve.ts";
import {
  validatePool,
  validateQuality,
  validateSkill,
  validateStat,
} from "../src/validation.ts";
import { readChar, type ICinChar } from "../src/types.ts";
import { saveChar } from "./chargen.ts";

function guard(u: IUrsamuSDK, c: ICinChar): boolean {
  if (c.status === "approved") {
    u.send("Character is locked.");
    return false;
  }
  if (c.status === "none") {
    u.send("No character. Use %ch+chargen/start%cn.");
    return false;
  }
  return true;
}

export function buildStatCmds() {
  addCmd({
    name: "+stat",
    pattern: /^\+stat\s+(\S+)\s*=\s*(\d+)/i,
    lock: "connected",
    category: "Cinematic",
    help: `+stat <name>=<level>  — Set an attribute (1-6).
Partial names work: dex, str, int, con, per, wil.

Examples:
  +stat strength=3
  +stat dex=5`,
    exec: async (u) => {
      const c = readChar(u.me.state);
      if (!guard(u, c)) return;
      const name = u.util.stripSubs(u.cmd.args[0]).trim();
      const value = parseInt(u.cmd.args[1], 10);
      const key = resolveAttr(name);
      if (!key) {
        u.send(`%crUnknown attribute%cn: ${name}`);
        return;
      }
      const v = validateStat(key, value);
      if (v !== true) {
        u.send(`%cr${v}%cn`);
        return;
      }
      c.attrs[key] = value;
      c.status = c.status === "none" ? "draft" : c.status;
      const pool = validatePool(c);
      if (pool !== true) {
        u.send(`%cr${pool}%cn`);
        return;
      }
      await saveChar(u, c);
      u.send(`${name} set to %cy${value}%cn.`);
    },
  });

  addCmd({
    name: "+skill",
    pattern: /^\+skill\s+(.+?)\s*=\s*(\d+)/i,
    lock: "connected",
    category: "Cinematic",
    help: `+skill <name>=<level>  — Set a skill (0-10). 0 removes.
Partial names work: kung, gun, acro, notice.

Examples:
  +skill kung-fu=4
  +skill occultism=2`,
    exec: async (u) => {
      const c = readChar(u.me.state);
      if (!guard(u, c)) return;
      const m = resolveSkill(
        u.util.stripSubs(u.cmd.args[0]),
      );
      if ("error" in m) {
        u.send(`%cr${m.error}%cn`);
        return;
      }
      const slug = m.slug;
      const value = parseInt(u.cmd.args[1], 10);
      const v = validateSkill(slug, value);
      if (v !== true) {
        u.send(`%cr${v}%cn`);
        return;
      }
      if (value === 0) delete c.skills[slug];
      else c.skills[slug] = value;
      const pool = validatePool(c);
      if (pool !== true) {
        u.send(`%cr${pool}%cn`);
        return;
      }
      await saveChar(u, c);
      u.send(
        `${skillDef(slug)?.name ?? slug} set to %cy${value}%cn.`,
      );
    },
  });

  const trait = (
    name: string,
    kind: "quality" | "drawback",
    pattern: RegExp,
  ) =>
    addCmd({
      name,
      pattern,
      lock: "connected",
      category: "Cinematic",
      help: `${name} <slug>[=<level>][:<qualifier>]  — Add a ${kind}.

Levels multiply the cost of per-level traits; the qualifier shows in
parens on the sheet (Contacts, Status, Rank, Resources, etc).

Examples:
  ${name} athlete
  ${name} hard-to-kill=3
  ${name} contacts=2:RIPD`,
      exec: async (u) => {
        const c = readChar(u.me.state);
        if (!guard(u, c)) return;
        const raw = u.util.stripSubs(u.cmd.args[0]).trim();
        const slug = slugify(raw.split("=")[0].split(":")[0]);
        const lvRaw = raw.split("=")[1]?.split(":")[0] ?? "1";
        const n = parseInt(lvRaw, 10);
        if (!Number.isNaN(n) && n < 0) {
          u.send("%crRating cannot be negative.%cn");
          return;
        }
        const level = Math.max(1, n || 1);
        const note = raw.split(":").slice(1).join(":").trim();
        const v = validateQuality(slug, kind);
        if (v !== true) {
          u.send(`%cr${v}%cn`);
          return;
        }
        const q = qualityDef(slug);
        if (q?.max && level > q.max) {
          u.send(`%cr${q.name} max level is ${q.max}%cn`);
          return;
        }
        const list = kind === "quality"
          ? c.qualities
          : c.drawbacks;
        if (list.some((e) => e.slug === slug)) {
          u.send("Already taken.");
          return;
        }
        const entry = { slug, level, note };
        list.push(entry);
        if (kind === "quality" && !c.template) {
          const tf = templateForQuality(slug);
          if (tf) c.template = tf;
        }
        const pool = validatePool(c);
        if (pool !== true) {
          list.pop();
          u.send(`%cr${pool}%cn`);
          return;
        }
        await saveChar(u, c);
        u.send(`${q?.name ?? slug}` + (level > 1 ? ` x${level}` : "") + (note ? ` (${note})` : "") + " added.");
      },
    });

  trait("+quality", "quality", /^\+quality\s+(.+)/i);
  trait("+drawback", "drawback", /^\+drawback\s+(.+)/i);
}
