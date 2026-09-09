// commands/rite.ts -- +rite for WtA rite list / info / learn / cast / teach / forget.
//
// All persistence flows through saveChar(); pure mechanics live in core/rites.ts.

import { addCmd, gameHooks } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findByPlayer, saveChar } from "../db/charDb.ts";
import {
  castRite,
  forgetRite,
  getRite,
  knowsRite,
  learnRite,
} from "../core/rites.ts";
import { WTA_RITES, type IRiteDef, type RiteCategory } from "../splats/wta/data/rites.ts";
import { header, divider, footer } from "../core/format.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { poseRoom } from "../core/poseRoom.ts";
import { shiftedDisplayName } from "../core/displayName.ts";
import { caernBonus, caernIdForRoom } from "../core/caern.ts";
import { findCaernById } from "../db/caernDb.ts";

const CATEGORIES: readonly RiteCategory[] = [
  "mystic", "minor", "seasonal", "accord", "caern",
  "death", "renown", "punishment", "passage",
];

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtRiteRow(slug: string, def: IRiteDef): string {
  return `  L${def.level} ${titleCase(def.category).padEnd(11)} %ch${def.name}%cn  %cw[${slug}]%cn`;
}

async function renderList(filter?: string): Promise<string> {
  const lines: string[] = [header(filter ? `Rites: ${titleCase(filter)}` : "Rites")];
  const entries = Object.entries(WTA_RITES)
    .filter(([, d]) => !filter || d.category === filter)
    .sort(([, a], [, b]) =>
      a.level - b.level || a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
    );
  if (entries.length === 0) {
    lines.push("  (No rites match.)");
  } else {
    for (const [slug, def] of entries) lines.push(fmtRiteRow(slug, def));
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderKnown(rites: string[]): Promise<string> {
  const lines: string[] = [header("Rites Known")];
  if (rites.length === 0) {
    lines.push("  (You know no rites.)");
  } else {
    for (const slug of rites.slice().sort()) {
      const def = getRite(slug);
      if (def) lines.push(fmtRiteRow(slug, def));
      else     lines.push(`  %cr??%cn ${slug} (unknown rite)`);
    }
  }
  lines.push(footer());
  return lines.join("%r");
}

async function renderInfo(slug: string, def: IRiteDef): Promise<string> {
  return [
    header(def.name),
    `  Slug:        ${slug}`,
    `  Level:       ${def.level}`,
    `  Category:    ${titleCase(def.category)}`,
    `  Difficulty:  ${def.difficulty ?? 7}`,
    divider("Description"),
    `  ${def.description}`,
    footer(),
  ].join("%r");
}

addCmd({
  name: "+rite",
  pattern: /^\+rite(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Werewolf",
  help: `+rite[/switch] <arg>  -- Werewolf rites: learn, cast, list, info.

SYNTAX
  +rite                       List rites your character knows.
  +rite/list [<category>]     List all rites (optionally filtered).
  +rite/info <slug>           Details for a single rite.
  +rite/learn <slug>          Add a rite to your known list.
  +rite/cast <slug>           Cast a known rite (Gnosis roll vs difficulty).
  +rite/teach <target>=<slug> (Staff) Teach a target the named rite.
  +rite/forget <slug>         (Staff) Remove a rite from your known list.

EXAMPLES
  +rite/list mystic
  +rite/info rite-of-cleansing
  +rite/learn rite-of-passage
  +rite/cast rite-of-cleansing

SEE ALSO: +help rite, +help wod20th`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // /list [category]
    if (sw === "list") {
      const cat = arg.toLowerCase();
      if (cat && !CATEGORIES.includes(cat as RiteCategory)) {
        u.send(`Unknown category. Use one of: ${CATEGORIES.join(", ")}.`);
        return;
      }
      u.send(await renderList(cat || undefined));
      return;
    }

    // /info <slug>
    if (sw === "info") {
      if (!arg) { u.send("Usage: +rite/info <slug>"); return; }
      const def = getRite(arg);
      if (!def) { u.send(`Unknown rite: ${arg}`); return; }
      u.send(await renderInfo(arg.toLowerCase().trim(), def));
      return;
    }

    // /teach <target>=<slug>
    if (sw === "teach") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      const [lhs, rhs] = arg.split("=").map((s) => s.trim());
      if (!lhs || !rhs) { u.send("Usage: +rite/teach <target>=<slug>"); return; }
      const target = await u.util.target(u.me, lhs, true);
      if (!target) { u.send("Target not found."); return; }
      if (!(await u.canEdit(u.me, target))) { u.send("%crPermission denied.%cn"); return; }
      const char = await findByPlayer(target.id);
      if (!char) { u.send(`${u.util.displayName(target, u.me)} has no character on file.`); return; }
      const res = learnRite(char, rhs);
      if (!res.ok) { u.send(res.message); return; }
      char.rites = res.rites!;
      await saveChar(char);
      gameHooks.emit("wod20th:rite-learned", {
        playerId: target.id, charId: char.id, slug: rhs.toLowerCase().trim(), taughtBy: u.me.id,
      });
      u.send(`%cgTaught ${u.util.displayName(target, u.me)}: ${res.message}%cn`);
      return;
    }

    // From here on the actor's own character is required.
    const char = await findByPlayer(u.me.id);
    if (!char) { u.send("You have no character on file."); return; }
    if (char.splat !== "wta") { u.send("Only Garou (WtA) characters can use rites."); return; }

    // /learn <slug>
    if (sw === "learn") {
      if (!arg) { u.send("Usage: +rite/learn <slug>"); return; }
      const res = learnRite(char, arg);
      if (!res.ok) { u.send(res.message); return; }
      char.rites = res.rites!;
      await saveChar(char);
      gameHooks.emit("wod20th:rite-learned", {
        playerId: u.me.id, charId: char.id, slug: arg.toLowerCase().trim(),
      });
      u.send(`%cg${res.message}%cn`);
      return;
    }

    // /forget <slug>  -- staff-only
    if (sw === "forget") {
      if (!isStaff(u)) { u.send("%crPermission denied.%cn"); return; }
      if (!arg) { u.send("Usage: +rite/forget <slug>"); return; }
      const res = forgetRite(char, arg);
      if (!res.ok) { u.send(res.message); return; }
      char.rites = res.rites!;
      await saveChar(char);
      u.send(`%cy${res.message}%cn`);
      return;
    }

    // /cast <slug>
    if (sw === "cast") {
      if (!arg) { u.send("Usage: +rite/cast <slug>"); return; }
      const def = getRite(arg);
      if (!def) { u.send(`Unknown rite: ${arg}`); return; }
      const slug = arg.toLowerCase().trim();
      if (!knowsRite(char, slug)) {
        u.send(`You have not learned ${def.name}.`); return;
      }
      const block = frenzyBlockMessage(char, "cast a rite");
      if (block) { u.send(block); return; }
      // Caern bonus: if cast in a caern-bound room, add ritualDieBonus to pool.
      let extraDice = 0;
      // deno-lint-ignore no-explicit-any
      const caernId = caernIdForRoom((u as any).here ?? undefined);
      if (caernId) {
        const caern = await findCaernById(caernId);
        const bonus = caernBonus(char, caern);
        if (bonus.ritualDieBonus) extraDice = bonus.ritualDieBonus;
      }
      const res = castRite(char, slug, undefined, extraDice);
      gameHooks.emit("wod20th:rite-cast", {
        playerId: u.me.id, charId: char.id, slug, roll: res.roll, outcome: res.ok ? "success" : "failure",
      });
      const name = u.util.displayName(u.me, u.me);
      u.send(`%ch${name}%cn casts %ch${def.name}%cn -- ${res.message}  %cw[${res.roll.dice.join(",")} vs ${res.roll.difficulty}]%cn`);
      poseRoom(u, `%cy${shiftedDisplayName(char, name)}%cn begins to chant, performing the %ch${def.name}%cn.`);
      return;
    }

    if (sw) { u.send(`Unknown switch: /${sw}. See +help rite.`); return; }

    // No switch -- list known rites.
    u.send(await renderKnown(char.rites ?? []));
  },
});
