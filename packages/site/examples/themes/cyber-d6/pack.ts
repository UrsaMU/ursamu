/**
 * Pack this theme folder into <id>.zip for Admin upload.
 *
 *   deno task pack
 *   deno run -A pack.ts --out ./my-theme.zip
 */

import {
  basename,
  dirname,
  fromFileUrl,
  join,
  resolve,
} from "jsr:@std/path@^1.0.0";
import { existsSync, walk } from "jsr:@std/fs@^1.0.0";
import { parseArgs } from "jsr:@std/cli@^1.0.0/parse-args";
import { zipSync } from "npm:fflate@0.8.2";

const THEME = resolve(dirname(fromFileUrl(import.meta.url)));
const args = parseArgs(Deno.args, {
  string: ["out"],
  boolean: ["help"],
  alias: { h: "help", o: "out" },
});

if (args.help) {
  console.log(`pack — zip this theme for Admin upload

Usage:
  deno task pack
  deno run -A pack.ts [--out file.zip]
`);
  Deno.exit(0);
}

if (!existsSync(join(THEME, "theme.json"))) {
  console.error("Missing theme.json");
  Deno.exit(1);
}

const id = basename(THEME);
const outPath = resolve(
  String(args.out ?? join(THEME, `${id}.zip`)),
);

const skip = [
  /node_modules/,
  /\.git/,
  /\.preview-shell/,
  /\.theme-studio/,
  /\.draft/,
  /\.zip$/,
  /deno\.lock$/,
];

const files: Record<string, Uint8Array> = {};
for await (
  const e of walk(THEME, { includeDirs: false, skip })
) {
  const rel = e.path
    .slice(THEME.length)
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/");
  if (!rel || rel.endsWith(".zip")) continue;
  // Keep pack/preview tooling out of install zip (optional)
  if (
    rel === "pack.ts" ||
    rel === "preview.ts" ||
    rel === "deno.json" ||
    rel === ".gitignore"
  ) {
    continue;
  }
  files[`${id}/${rel}`] = await Deno.readFile(e.path);
}

const zipped = zipSync(files, { level: 6 });
await Deno.writeFile(outPath, zipped);
console.log(
  `Packed ${Object.keys(files).length} files → ${outPath} ` +
    `(${zipped.byteLength} bytes)`,
);
console.log("Upload in Admin → Settings → Public site.");
