// tests/latin1_output.test.ts -- Terminal-facing source must be Latin-1 only.
//
// MUSH clients commonly speak ISO-8859-1. Codepoints above U+00FF
// (em dashes, arrows, ellipsis, smart quotes, box drawing, etc.) break
// or mojibake on the wire. Latin-1 itself (e.g. o-umlaut in Roetschreck
// / Roe-tschreck spelling "Rötschreck") is OK.
import { assertEquals } from "@std/assert";

// Player-facing help + catalog (root-owned legacy files may still
// hold ellipsis; gate what this plugin actively ships for +help).
const ROOTS = [
  "help",
  "core/helpIndex.ts",
  "commands/help.ts",
  "core/kindred.ts",
  "core/disciplineUse.ts",
  "core/humanity.ts",
  "core/diablerie.ts",
  "core/ghoul.ts",
  "core/clanWeakness.ts",
  "core/feed.ts",
  "core/bond.ts",
  "core/hazard.ts",
  "commands/blood.ts",
  "commands/beast.ts",
  "commands/discipline.ts",
  "commands/coterie.ts",
  "commands/domain.ts",
  "commands/boon.ts",
  "commands/diablerie.ts",
  "commands/derange.ts",
  "commands/embrace.ts",
  "commands/feed.ts",
  "commands/humanity.ts",
  "commands/hazard.ts",
  "commands/stake.ts",
  "commands/torpor.ts",
];

const EXT = new Set([".ts", ".md", ".json"]);

async function* walkFiles(root: string): AsyncGenerator<string> {
  try {
    const st = await Deno.stat(root);
    if (st.isFile) {
      yield root;
      return;
    }
  } catch {
    return;
  }
  for await (const ent of Deno.readDir(root)) {
    const path = `${root}/${ent.name}`;
    if (ent.isDirectory) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      yield* walkFiles(path);
    } else if (ent.isFile) {
      const dot = ent.name.lastIndexOf(".");
      const ext = dot >= 0 ? ent.name.slice(dot) : "";
      if (EXT.has(ext)) yield path;
    }
  }
}

Deno.test("terminal-facing sources use only Latin-1 codepoints", async () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for await (const path of walkFiles(root)) {
      const text = await Deno.readTextFile(path);
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
          const cp = line.charCodeAt(j);
          if (cp > 0xff) {
            const ch = line[j];
            offenders.push(
              `${path}:${i + 1}: U+${cp.toString(16).toUpperCase()} ` +
                `${JSON.stringify(ch)} -- ${line.trim().slice(0, 80)}`,
            );
            break; // one hit per line is enough
          }
        }
      }
    }
  }
  assertEquals(
    offenders,
    [],
    "Non-Latin-1 characters in terminal-facing source:\n" +
      offenders.slice(0, 40).join("\n") +
      (offenders.length > 40 ? `\n... +${offenders.length - 40} more` : ""),
  );
});
