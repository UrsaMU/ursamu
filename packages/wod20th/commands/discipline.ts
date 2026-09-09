// commands/discipline.ts -- +discipline list / powers / info / use (VtM).

import { addCmd, gameHooks } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import { findByPlayer, saveChar, unsetCharFields } from "../db/charDb.ts";
import {
  findDiscipline,
  listDisciplines,
  useDisciplinePower,
  powersKnown,
  getPower,
} from "../core/disciplineUse.ts";
import {
  potenceAutoSuccesses,
  fortitudeSoakBonus,
  celerityLeft,
} from "../core/disciplineCombat.ts";
import { isKindred } from "../core/kindred.ts";
import { VTM_DISCIPLINES } from "../splats/vtm/data/disciplines.ts";
import { discDots, powersForDiscipline } from "../splats/vtm/data/powers.ts";
import { getMagicPath } from "../splats/vtm/data/magicPaths.ts";
import { header, footer, frame } from "../core/format.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { emitPoolSpent } from "../hooks.ts";

addCmd({
  name: "+discipline",
  pattern: /^\+discipline(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Vampire",
  help: `+discipline[/switch] [<arg>]  -- Kindred Disciplines & powers.

  Full help: +help discipline

Examples:
  +help discipline`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    const char = await findByPlayer(u.me.id);
    if (!char) {
      u.send("No character on file.");
      return;
    }
    if (!isKindred(char)) {
      u.send("Only Kindred have Disciplines.");
      return;
    }

    if (!sw || sw === "list") {
      const known = listDisciplines(char);
      const lines = [header("Disciplines")];
      if (known.length === 0) {
        lines.push("  (none yet)");
      } else {
        for (const d of known) {
          const dots = "*".repeat(d.dots).padEnd(5);
          lines.push(`  %ch${d.name.padEnd(16)}%cn  ${dots} (${d.dots})`);
        }
      }
      const pot = potenceAutoSuccesses(char);
      const fort = fortitudeSoakBonus(char);
      const cel = celerityLeft(char);
      lines.push(header("Combat"));
      if (pot > 0) lines.push(`  Potence:   +${pot} auto on damage`);
      if (fort > 0) {
        lines.push(`  Fortitude: +${fort} soak (incl. agg)`);
      }
      if (cel > 0) lines.push(`  Celerity:  ${cel} extra action(s) left`);
      if (char.feralWeapons) lines.push("  Claws:     %crFeral Weapons ON%cn");
      if (char.obfuscated) lines.push("  Obfuscate: active");
      if (char.heightenedSenses) {
        lines.push("  Auspex:    Heightened Senses");
      }
      if (
        pot < 1 && fort < 1 && cel < 1 &&
        !char.feralWeapons && !char.obfuscated
      ) {
        lines.push("  (no physical combat bonuses)");
      }
      lines.push("  %cx+discipline/powers  |  /use <name> [target]%cn");
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "primary") {
      // +discipline/primary [<path>] -- view or set blood-magic primary path.
      const pp = { ...(char.primaryPaths ?? {}) };
      if (!arg) {
        const lines = [header("Primary Paths")];
        lines.push(
          `  Thaumaturgy:  %ch${pp["thaumaturgy"] ?? "Path of Blood"}%cn`,
        );
        lines.push(
          `  Necromancy:   %ch${pp["necromancy"] ?? "Sepulchre Path"}%cn`,
        );
        lines.push(
          "  %cxSet with: +discipline/primary <path name>%cn",
        );
        lines.push(footer());
        u.send(lines.join("%r"));
        return;
      }
      const path = getMagicPath(arg);
      if (!path) {
        u.send(`%crUnknown path "${arg}".%cn`);
        return;
      }
      const schoolDots = discDots(
        char.disciplines,
        path.school === "thaumaturgy" ? "Thaumaturgy" : "Necromancy",
      );
      if (schoolDots < 1) {
        u.send(
          `%crYou need ${path.school === "thaumaturgy" ? "Thaumaturgy" : "Necromancy"} ` +
            `1+ before choosing a primary path.%cn`,
        );
        return;
      }
      // Moving the primary path: any secondary dots stored under the old
      // primary's name fold back into the school (they were never separate).
      pp[path.school] = path.name;
      char.primaryPaths = pp;
      await saveChar(char);
      u.send(
        `%chPrimary ${path.school} path set to ${path.name}.%cn ` +
          `(${path.book})`,
      );
      return;
    }

    if (sw === "powers") {
      const known = powersKnown(
        char.disciplines ?? {},
        char.primaryPaths,
      );
      const lines = [header("Powers Available")];
      if (known.length === 0) {
        lines.push("  (learn more Discipline dots)");
      } else {
        for (const p of known) {
          const cost = p.bloodCost > 0 ? `${p.bloodCost}B` : "0B";
          const tgt = p.needsTarget ? " *" : "";
          const path = p.path ? `%cx(${p.path})%cn ` : "";
          lines.push(
            `  %ch${p.name.padEnd(22)}%cn L${p.level} ${cost}${tgt}  ` +
              `${path}%cw[${p.slug}]%cn`,
          );
        }
        lines.push("  %cx* needs target: /use <slug> <name>%cn");
      }
      lines.push(footer());
      u.send(lines.join("%r"));
      return;
    }

    if (sw === "info") {
      if (!arg) {
        u.send("Usage: +discipline/info <name|slug>");
        return;
      }
      const power = getPower(arg);
      if (power) {
        const dots = findDiscipline(char, power.discipline)?.dots ?? 0;
        const ok = dots >= power.level;
        u.send(frame(power.name, [
          `  Disc:   ${power.discipline} ${power.level}+`,
          `  Cost:   ${power.bloodCost} Blood`,
          power.pool
            ? `  Pool:   ${power.pool} vs ${power.difficulty ?? 6}`
            : "",
          power.needsTarget ? "  Target: required" : "",
          power.resist === "willpower" ? "  Resist: Willpower" : "",
          `  Book:   ${power.book}`,
          `  ${power.blurb}`,
          ok
            ? "  %cgYou can use this.%cn"
            : `  %cyNeed ${power.discipline} ${power.level} (have ${dots}).%cn`,
        ].filter(Boolean)));
        return;
      }
      const known = findDiscipline(char, arg);
      const cat = Object.values(VTM_DISCIPLINES).find(
        (d) =>
          d.name.toLowerCase() === arg.toLowerCase() ||
          d.id === arg.toLowerCase() ||
          d.name.toLowerCase().startsWith(arg.toLowerCase()),
      );
      if (!cat && !known) {
        u.send(`Unknown: ${arg}`);
        return;
      }
      const name = known?.name ?? cat!.name;
      const dots = known?.dots ?? 0;
      const powers = powersForDiscipline(name);
      const lines = [
        `  Dots:   ${dots}`,
        cat?.book ? `  Book:   ${cat.book}` : "",
      ];
      if (powers.length) {
        lines.push("  Powers:");
        for (const p of powers) {
          const lock = dots >= p.level ? "%cg" : "%cx";
          const tag = p.needsTarget ? " *" : "";
          lines.push(
            `  ${lock}L${p.level} ${p.name}%cn (${p.bloodCost}B)${tag}`,
          );
        }
      }
      u.send(frame(name, lines.filter(Boolean)));
      return;
    }

    if (sw === "use") {
      if (!arg) {
        u.send("Usage: +discipline/use <power> [<target>]");
        return;
      }
      const before = char.bloodPool ?? char.bloodMax ?? 0;

      // First pass: detect TARGET_NEEDED without spending.
      let probe = useDisciplinePower(char, arg, {});
      if (
        !probe.ok &&
        probe.message.startsWith("TARGET_NEEDED:")
      ) {
        const tName = probe.needsTargetName ??
          probe.message.slice("TARGET_NEEDED:".length);
        const tgtObj = await u.util.target(u.me, tName, true);
        if (!tgtObj) {
          u.send(`Target not found: ${tName}`);
          return;
        }
        if (tgtObj.id === u.me.id) {
          u.send("You cannot target yourself with that power.");
          return;
        }
        const defender = await findByPlayer(tgtObj.id);
        if (!defender) {
          u.send("Target has no character on file.");
          return;
        }
        probe = useDisciplinePower(char, arg, {
          target: defender,
          targetName: u.util.displayName(tgtObj, u.me),
        });
        if (!probe.ok) {
          u.send(`%cr${probe.message}%cn`);
          return;
        }
        await saveChar(char);
        await persistToggles(char);
        u.send(`%cg${probe.message}%cn`);
        if (probe.rollLine) u.send(`%cy${probe.rollLine}%cn`);
        if (probe.resistLine) u.send(`%cy${probe.resistLine}%cn`);
        if (probe.targetNotify) {
          u.send(probe.targetNotify, tgtObj.id);
        }
        const who = u.util.displayName(u.me, u.me);
        poseRoom(
          u,
          `%cy${who}%cn ${probe.pose ?? "invokes a Discipline"}.`,
        );
        emitSpend(u, char, before, probe.bloodLeft);
        emitUsed(u, char, probe, before);
        return;
      }

      if (!probe.ok) {
        u.send(`%cr${probe.message}%cn`);
        return;
      }
      await saveChar(char);
      await persistToggles(char);
      u.send(`%cg${probe.message}%cn`);
      if (probe.rollLine) u.send(`%cy${probe.rollLine}%cn`);
      if (probe.resistLine) u.send(`%cy${probe.resistLine}%cn`);
      const who = u.util.displayName(u.me, u.me);
      poseRoom(
        u,
        `%cy${who}%cn ${probe.pose ?? "invokes a Discipline"}.`,
      );
      emitSpend(u, char, before, probe.bloodLeft);
      emitUsed(u, char, probe, before);
      return;
    }

    u.send(`Unknown switch /${sw}. Try +help discipline.`);
  },
});

async function persistToggles(
  char: Awaited<ReturnType<typeof findByPlayer>> & object,
): Promise<void> {
  if (!char) return;
  const c = char as {
    id: string;
    feralWeapons?: boolean;
    obfuscated?: boolean;
    heightenedSenses?: boolean;
  };
  const unset: Array<
    "feralWeapons" | "obfuscated" | "heightenedSenses"
  > = [];
  if (c.feralWeapons === undefined) unset.push("feralWeapons");
  if (c.obfuscated === undefined) unset.push("obfuscated");
  if (c.heightenedSenses === undefined) unset.push("heightenedSenses");
  if (unset.length) await unsetCharFields(c.id, unset);
}

function emitSpend(
  u: IUrsamuSDK,
  char: { id: string; bloodMax?: number },
  before: number,
  after?: number,
): void {
  const spent = Math.max(0, before - (after ?? before));
  if (spent < 1) return;
  emitPoolSpent({
    playerId: u.me.id,
    charId: char.id,
    pool: "blood",
    amount: spent,
    remaining: after ?? 0,
    permanent: char.bloodMax ?? 0,
  });
}

function emitUsed(
  u: IUrsamuSDK,
  char: { id: string },
  result: {
    name?: string;
    dots?: number;
    power?: { slug?: string; name?: string };
    bloodLeft?: number;
  },
  before: number,
): void {
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).emit?.("wod20th:discipline-used", {
    playerId: u.me.id,
    charId: char.id,
    name: result.name ?? result.power?.name,
    dots: result.dots,
    slug: result.power?.slug,
    bloodBefore: before,
    bloodAfter: result.bloodLeft,
  });
}
