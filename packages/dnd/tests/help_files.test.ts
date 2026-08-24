/**
 * Help authoring audit — width, length, title, coverage.
 */
import { assert, assertEquals } from "@std/assert";
import { walk } from "@std/fs";
import { basename, join } from "@std/path";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const HELP = join(import.meta.dirname!, "../help");

const REQUIRED = [
  "dnd",
  "cg",
  "sheet",
  "roll",
  "hp",
  "rest",
  "deathsave",
  "combat",
  "attack",
  "cast",
  "kill",
  "loot",
  "inventory",
  "item",
  "npc",
  "level",
  "xp",
  "condition",
  "inspiration",
  "money",
  "spells",
  "npc",
  "world",
  "adventure",
  "chest",
  "altar",
  "hire",
  "approve",
  "staffkit",
  "travel",
  "camp",
  "party",
  "magic",
  "road",
  "bounty",
  "rep",
  "caravan",
  "event",
];

Deno.test("help files cover all required topics", OPTS, async () => {
  const found = new Set<string>();
  for await (const e of walk(HELP, { exts: [".md"], maxDepth: 1 })) {
    if (!e.isFile) continue;
    found.add(basename(e.path, ".md"));
  }
  for (const t of REQUIRED) {
    assert(found.has(t), `missing help/${t}.md`);
  }
});

Deno.test("help files meet width and length caps", OPTS, async () => {
  for await (const e of walk(HELP, { exts: [".md"], maxDepth: 1 })) {
    if (!e.isFile) continue;
    const text = await Deno.readTextFile(e.path);
    const lines = text.replace(/\n$/, "").split("\n");
    const name = basename(e.path);
    assert(
      lines.length <= 22,
      `${name}: ${lines.length} lines (max 22)`,
    );
    for (let i = 0; i < lines.length; i++) {
      assert(
        lines[i].length <= 78,
        `${name}:${i + 1} is ${lines[i].length} cols`,
      );
    }
    assert(
      lines[0].startsWith("+"),
      `${name}: title must be +TOPIC`,
    );
    assertEquals(
      lines[0],
      lines[0].toUpperCase(),
      `${name}: title must be ALL CAPS`,
    );
  }
});

Deno.test("help files have SYNTAX and EXAMPLES", OPTS, async () => {
  for await (const e of walk(HELP, { exts: [".md"], maxDepth: 1 })) {
    if (!e.isFile) continue;
    const text = await Deno.readTextFile(e.path);
    const name = basename(e.path);
    if (name === "dnd.md") {
      assert(text.includes("COMMANDS") || text.includes("TOPICS"));
      continue;
    }
    assert(text.includes("SYNTAX"), `${name}: missing SYNTAX`);
    assert(text.includes("EXAMPLES"), `${name}: missing EXAMPLES`);
    assert(
      text.includes("SEE ALSO"),
      `${name}: missing SEE ALSO`,
    );
  }
});
