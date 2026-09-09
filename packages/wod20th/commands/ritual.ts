// commands/ritual.ts -- +ritual list / book / learn / forget / cast / teach (VtM).
//
// Blood-magic rituals (Thaumaturgy & Necromancy). All persistence flows
// through saveChar(); pure mechanics live in core/vtmRituals.ts.

import { addCmd } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  castRitual,
  forgetRitual,
  getRitual,
  knowsRitual,
  knownRituals,
  learnRitual,
  ritualCastTime,
  schoolRating,
} from "../core/vtmRituals.ts";
import {
  ALL_RITUALS,
  type IRitualDef,
  type RitualSchool,
} from "../splats/vtm/data/rituals.ts";
import { header, footer } from "../core/format.ts";
import { isKindred } from "../core/kindred.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { emitPoolSpent } from "../hooks.ts";

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function schoolTitle(school: RitualSchool): string {
  return school === "thaumaturgy" ? "Thaumaturgy" : "Necromancy";
}

function fmtRow(def: IRitualDef, known: boolean): string {
  const mark = known ? "%cg*%cn" : " ";
  return ` ${mark} L${def.level} %ch${def.name}%cn  %cw[${def.slug}]%cn`;
}

function renderCatalog(
  filter: RitualSchool | undefined,
  knownSlugs: readonly string[],
): string {
  const known = new Set(knownSlugs.map((s) => s.toLowerCase()));
  const lines = [
    header(
      filter ? `Rituals: ${schoolTitle(filter)}` : "Blood-Magic Rituals",
    ),
  ];
  const schools: RitualSchool[] = filter
    ? [filter]
    : ["thaumaturgy", "necromancy"];
  for (const school of schools) {
    if (!filter) lines.push(`  %cy-- ${schoolTitle(school)} --%cn`);
    const defs = ALL_RITUALS
      .filter((d) => d.school === school)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    for (const def of defs) lines.push(fmtRow(def, known.has(def.slug)));
    lines.push("  %cx(%cg*%cn = known)%cn");
  }
  lines.push(footer());
  return lines.join("%r");
}

function renderBook(def: IRitualDef, known: boolean): string {
  const lines = [
    `%ch${def.name}%cn  %cw[${def.slug}]%cn`,
    `  School:     ${schoolTitle(def.school)}`,
    `  Level:      ${def.level}`,
    `  Casting:    ${ritualCastTime(def)}; Int+Occult vs ${Math.min(9, 3 + def.level)}`,
    `  Blood Cost: ${def.bloodCost}`,
  ];
  if (def.components) lines.push(`  Components: ${def.components}`);
  lines.push(`  Effect:     ${def.blurb}`);
  lines.push(`  Source:     ${def.book}${known ? "  %cg(known)%cn" : ""}`);
  return lines.join("%r");
}

addCmd({
  name: "+ritual",
  pattern: /^\+ritual(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+ritual[/switch] [<arg>]  -- Blood-magic rituals (VtM).

SYNTAX
  +ritual                   Rituals you know.
  +ritual/list [school]     Full catalog (thaumaturgy|necromancy).
  +ritual/book <name>       Ritual detail card.
  +ritual/learn <name>      Learn a ritual (level <= school rating).
  +ritual/forget <name>     Drop a ritual.
  +ritual/cast <name>       Cast: Int+Occult vs 3+level; blood cost per ritual.
  +ritual/teach <t>/<name>  Grant a ritual (staff).

EXAMPLES
  +ritual/learn pavis of foul presence
  +ritual/cast wake with evening's freshness
  +ritual/teach Alice/ward versus ghouls

SEE ALSO: +help discipline, +help blood`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    if (!isKindred(char)) {
      u.send("Only Kindred perform blood-magic rituals.");
      return;
    }

    // -- /teach (staff): +ritual/teach <target>/<name> -----------------------
    if (sw === "teach") {
      if (!isStaff(u)) {
        u.send("%crPermission denied.%cn");
        return;
      }
      const slash = arg.indexOf("/");
      if (slash === -1) {
        u.send("Usage: +ritual/teach <target>/<ritual>");
        return;
      }
      const targetName = arg.slice(0, slash).trim();
      const ritName = arg.slice(slash + 1).trim();
      const target = await u.util.target(u.me, targetName, true);
      if (!target) {
        u.send("Target not found.");
        return;
      }
      const tChar = await findByPlayer(target.id);
      if (!tChar) {
        u.send("That player has no character on file.");
        return;
      }
      const res = learnRitual(tChar, ritName, { bypassCap: true });
      if (!res.ok || !res.rituals) {
        u.send(`%cr${res.message}%cn`);
        return;
      }
      tChar.rituals = res.rituals;
      await saveChar(tChar);
      const def = getRitual(ritName)!;
      u.send(
        `%chTaught:%cn ${def.name} -> ${u.util.displayName(target, u.me)}.`,
      );
      u.send(
        `%cy${u.util.displayName(u.me, target)} teaches you ${def.name}.%cn`,
        target.id,
      );
      return;
    }

    // -- /list ----------------------------------------------------------------
    if (sw === "list") {
      const q = arg.toLowerCase();
      const filter: RitualSchool | undefined =
        q.startsWith("thaum") ? "thaumaturgy"
        : q.startsWith("necro") ? "necromancy"
        : undefined;
      u.send(renderCatalog(filter, char.rituals ?? []));
      return;
    }

    // -- /book ----------------------------------------------------------------
    if (sw === "book") {
      if (!arg) {
        u.send("Usage: +ritual/book <name>");
        return;
      }
      const def = getRitual(arg);
      if (!def) {
        u.send(`%crUnknown ritual "${arg}".%cn`);
        return;
      }
      u.send(renderBook(def, knowsRitual(char, def.slug)));
      return;
    }

    // -- /learn ---------------------------------------------------------------
    if (sw === "learn") {
      if (!arg) {
        u.send("Usage: +ritual/learn <name>");
        return;
      }
      const res = learnRitual(char, arg);
      if (!res.ok || !res.rituals) {
        u.send(`%cr${res.message}%cn`);
        return;
      }
      char.rituals = res.rituals;
      await saveChar(char);
      u.send(`%ch${res.message}%cn`);
      return;
    }

    // -- /forget --------------------------------------------------------------
    if (sw === "forget") {
      if (!arg) {
        u.send("Usage: +ritual/forget <name>");
        return;
      }
      const res = forgetRitual(char, arg);
      if (!res.ok || !res.rituals) {
        u.send(`%cr${res.message}%cn`);
        return;
      }
      char.rituals = res.rituals;
      await saveChar(char);
      u.send(`%ch${res.message}%cn`);
      return;
    }

    // -- /cast ----------------------------------------------------------------
    if (sw === "cast") {
      if (!arg) {
        u.send("Usage: +ritual/cast <name>");
        return;
      }
      const res = castRitual(char, arg);
      if (!res.ok && !res.ritual) {
        u.send(`%cr${res.message}%cn`);
        return;
      }
      await saveChar(char);
      if (res.ritual && res.ritual.bloodCost > 0) {
        emitPoolSpent({
          playerId: u.me.id,
          charId: char.id,
          pool: "blood",
          amount: res.ritual.bloodCost,
          remaining: res.bloodLeft ?? 0,
          permanent: char.bloodMax ?? 0,
        });
      }
      u.send(res.ok ? res.message : `%cr${res.message}%cn`);
      const name = u.util.displayName(u.me, u.me);
      poseRoom(
        u,
        `%cy${name}%cn ${res.pose ?? "performs a ritual"}.`,
      );
      return;
    }

    // -- default: known rituals ----------------------------------------------
    const known = knownRituals(char);
    const lines = [header("Rituals Known")];
    if (known.length === 0) {
      lines.push("  (none yet -- +ritual/list to browse, +ritual/learn)");
    } else {
      for (const def of known.sort(
        (a, b) => a.level - b.level || a.name.localeCompare(b.name),
      )) {
        lines.push(
          `  L${def.level} %ch${def.name}%cn ` +
            `%cx(${schoolTitle(def.school)})%cn  %cw[${def.slug}]%cn`,
        );
      }
    }
    const tRating = schoolRating(char, "thaumaturgy");
    const nRating = schoolRating(char, "necromancy");
    lines.push(
      `  %cxThaumaturgy ${tRating} / Necromancy ${nRating} -- ` +
        `you may learn rituals up to those levels.%cn`,
    );
    lines.push(footer());
    u.send(lines.join("%r"));
  },
});
