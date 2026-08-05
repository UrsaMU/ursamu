/**
 * Pack a Court-style theme folder into a zip for admin upload.
 *
 *   deno task pack-theme
 *   deno task pack-theme examples/themes/court
 *   deno task pack-theme ./my-theme --out ./my-theme.zip
 */

import {
  basename,
  dirname,
  fromFileUrl,
  join,
  resolve,
} from "jsr:@std/path@^0.224.0";
import { existsSync, walk } from "jsr:@std/fs@^0.224.0";
import { zipSync } from "npm:fflate@0.8.2";
import { parse } from "jsr:@std/flags@^0.224.0";

const SITE = resolve(dirname(fromFileUrl(import.meta.url)), "..");
const DEFAULT_SRC = join(SITE, "examples/themes/court");

const args = parse(Deno.args, {
  string: ["out"],
  boolean: ["help"],
  alias: { h: "help", o: "out" },
});

if (args.help) {
  console.log(`pack-theme — zip a FE theme folder (Court format)

Usage:
  deno run -A scripts/pack-theme.ts [theme-dir] [--out file.zip]

Default theme-dir: examples/themes/court
`);
  Deno.exit(0);
}

const src = resolve(String(args._[0] ?? DEFAULT_SRC));
if (!existsSync(join(src, "theme.json"))) {
  console.error(`Missing theme.json in ${src}`);
  Deno.exit(1);
}

const id = basename(src);
const outPath = resolve(
  String(args.out ?? join(src, `${id}.zip`)),
);

const files: Record<string, Uint8Array> = {};
for await (
  const e of walk(src, {
    includeDirs: false,
    skip: [/node_modules/, /\.zip$/],
  })
) {
  const rel = e.path.slice(src.length).replace(/^[/\\]+/, "").replace(
    /\\/g,
    "/",
  );
  if (!rel || rel.endsWith(".zip")) continue;
  files[`${id}/${rel}`] = await Deno.readFile(e.path);
}

const zipped = zipSync(files, { level: 6 });
await Deno.writeFile(outPath, zipped);
console.log(
  `Packed ${Object.keys(files).length} files → ${outPath} (${zipped.byteLength} bytes)`,
);
console.log(`Upload in Admin → Settings → Public site.`);
