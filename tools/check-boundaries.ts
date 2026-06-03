/**
 * tools/check-boundaries.ts
 *
 * CI boundary check: @ursamu/core must never import from @ursamu/mush.
 *
 * Run:  deno run -A tools/check-boundaries.ts
 * Exit: 0 = clean, 1 = violations found
 */

import { walk } from "@std/fs";
import { relative } from "@std/path";

const CORE_DIR = new URL("../packages/core/src", import.meta.url).pathname;

const FORBIDDEN = [
  "@ursamu/mush",
  "../mush/",
  "../../mush/",
  "/packages/mush/",
];

let violations = 0;

for await (const entry of walk(CORE_DIR, { exts: [".ts"] })) {
  const src = await Deno.readTextFile(entry.path);
  for (const line of src.split("\n")) {
    if (!line.trimStart().startsWith("import")) continue;
    for (const forbidden of FORBIDDEN) {
      if (line.includes(forbidden)) {
        console.error(
          `BOUNDARY VIOLATION: ${relative(Deno.cwd(), entry.path)}:` +
          `\n  ${line.trim()}\n  core must not import from mush.\n`,
        );
        violations++;
      }
    }
  }
}

if (violations === 0) {
  console.log("✓ Boundary check passed — core imports no mush.");
} else {
  console.error(`✗ ${violations} boundary violation(s) found.`);
  Deno.exit(1);
}
