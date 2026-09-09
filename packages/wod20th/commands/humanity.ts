// commands/humanity.ts -- +humanity Conscience checks / degeneration.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  ALL_PATHS,
  humanityCheck,
  parseSinLevel,
  pathForChar,
  setHumanity,
  setPath,
} from "../core/humanity.ts";
import { isKindred } from "../core/kindred.ts";
import { frame, header, footer } from "../core/format.ts";
import { emitStatChanged } from "../hooks.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

addCmd({
  name: "+humanity",
  pattern: /^\+humanity(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+humanity[/switch] [<args>]  -- Path rating and sins.

SYNTAX
  +humanity                 Show path rating.
  +humanity/sins            Hierarchy of sins (1-10).
  +humanity/paths           List Paths of Enlightenment.
  +humanity/path <name>     Adopt a Path (staff or self).
  +humanity/check <level>   Virtue vs sin level.
  +humanity/set <n> <tgt>   Staff: set rating 0-10.

EXAMPLES
  +humanity/check 4
  +humanity/path Night
  +humanity/set 5 Alice

SEE ALSO: +help beast, +help diablerie, +help sheet`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (sw === "paths") {
      const lines = [header("Paths of Enlightenment")];
      for (const p of ALL_PATHS) {
        lines.push(
          `  %ch${p.name.padEnd(28)}%cn check: ${p.checkVirtue}`,
        );
        lines.push(`       ${p.book}`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "path") {
      const char = await findByPlayer(u.me.id);
      if (!char || !isKindred(char)) {
        u.send("Only Kindred walk Paths.");
        return;
      }
      if (!rest) {
        u.send("Usage: +humanity/path <name>  (+humanity/paths)");
        return;
      }
      // Staff may set path on others: path Name=Target
      let targetChar = char;
      let pathName = rest;
      const eq = rest.indexOf("=");
      if (eq > 0 && isStaff(u)) {
        pathName = rest.slice(0, eq).trim();
        const t = await u.util.target(
          u.me,
          rest.slice(eq + 1).trim(),
          true,
        );
        if (!t) {
          u.send("Target not found.");
          return;
        }
        const tc = await findByPlayer(t.id);
        if (!tc || !isKindred(tc)) {
          u.send("Target is not Kindred.");
          return;
        }
        targetChar = tc;
      }
      const r = setPath(targetChar, pathName);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(targetChar);
      u.send(`%cg${r.message}%cn`);
      return;
    }

    if (sw === "sins") {
      const me = await findByPlayer(u.me.id);
      const path = pathForChar(me?.path);
      const lines = [header(`${path.name} -- Sins`)];
      for (let i = 10; i >= 1; i--) {
        const s = path.sins[i];
        if (!s) continue;
        lines.push(
          `  L${String(i).padStart(2)}  ${s.label}`,
        );
        lines.push(`       %cx${s.examples}%cn`);
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "set") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const parts = rest.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        u.send("Usage: +humanity/set <0-10> <target>");
        return;
      }
      const n = parseSinLevel(parts[0]) ??
        (parts[0] === "0" ? 0 : null);
      if (n === null && parts[0] !== "0") {
        u.send("Humanity must be 0-10.");
        return;
      }
      const val = parts[0] === "0" ? 0 : n!;
      const target = await u.util.target(
        u.me,
        parts.slice(1).join(" "),
        true,
      );
      if (!target) {
        u.send("Target not found.");
        return;
      }
      if (!(await u.canEdit(u.me, target))) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const char = await findByPlayer(target.id);
      if (!char || !isKindred(char)) {
        u.send("Target is not Kindred.");
        return;
      }
      const old = char.humanity ?? 0;
      const r = setHumanity(char, val);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      await saveChar(char);
      emitStatChanged({
        staffId: u.me.id,
        targetId: target.id,
        charId: char.id,
        trait: "humanity",
        old,
        newVal: val,
      });
      u.send(
        `%chStat set:%cn ` +
          `${u.util.displayName(target, u.me)} / humanity = ${val}`,
      );
      return;
    }

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    if (!isKindred(char)) {
      u.send("Only Kindred track Humanity.");
      return;
    }

    if (sw === "check") {
      const level = parseSinLevel(rest);
      if (level === null) {
        u.send("Usage: +humanity/check <1-10>  (+humanity/sins)");
        return;
      }
      const r = humanityCheck(char, level);
      if (!r.ok) {
        u.send(`%cr${r.message}%cn`);
        return;
      }
      if (r.roll) {
        const path = pathForChar(char.path);
        u.send(
          `%cy${path.checkVirtue} (${r.roll.pool}d vs 8): ` +
            `[${r.roll.dice.join(" ")}] = ${r.roll.netSuccesses}` +
            `${r.roll.botch ? " BOTCH" : ""}%cn`,
        );
      }
      u.send(r.lost ? `%cr${r.message}%cn` : `%cg${r.message}%cn`);
      if (r.lost) await saveChar(char);
      return;
    }

    if (sw && sw !== "show") {
      u.send(`Unknown switch /${sw}. Try +help humanity.`);
      return;
    }

    const path = pathForChar(char.path);
    const v = char.virtues ?? {};
    u.send(frame(path.name, [
      `  Path:      ${path.name}`,
      `  Rating:    ${char.humanity ?? 0}`,
      `  Check:     ${path.checkVirtue} (${
        v[path.checkVirtue] ?? v.Conscience ?? 1
      })`,
      (char.diablerieStains ?? 0) > 0
        ? `  Stains:    ${char.diablerieStains} (diablerie)`
        : "",
      "  %cx+humanity/check <n> | /sins | /paths | /path <name>%cn",
    ].filter(Boolean)));
  },
});
