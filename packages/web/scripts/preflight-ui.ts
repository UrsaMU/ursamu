/**
 * Deploy / vendor hygiene checks for the staff console UI.
 *
 *   deno task preflight:ui
 *
 * Exit 1 if dist is missing critical assets or index references
 * hashes that are not on disk.
 */

import {
  dirname,
  fromFileUrl,
  join,
  resolve,
} from "jsr:@std/path@^0.224.0";
import { existsSync } from "jsr:@std/fs@^0.224.0";

const WEB = resolve(dirname(fromFileUrl(import.meta.url)), "..");
const DIST = join(WEB, "dist");
const errors: string[] = [];
const warns: string[] = [];

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function bad(msg: string) {
  errors.push(msg);
  console.error(`  ✗ ${msg}`);
}
function warn(msg: string) {
  warns.push(msg);
  console.warn(`  ! ${msg}`);
}

console.log("preflight:ui — staff console dist hygiene\n");

if (!existsSync(join(DIST, "index.html"))) {
  bad("dist/index.html missing — run: deno task ui:build");
} else {
  ok("dist/index.html");
  const html = await Deno.readTextFile(join(DIST, "index.html"));
  const refs = [
    ...html.matchAll(/(?:src|href)="(\/admin\/)?assets\/([^"]+)"/g),
  ].map((m) => m[2]!);
  if (!refs.length) {
    // vite may use relative assets/
    const rel = [
      ...html.matchAll(/(?:src|href)="\.?\/?assets\/([^"]+)"/g),
    ].map((m) => m[1]!);
    for (const r of rel) {
      if (!existsSync(join(DIST, "assets", r))) {
        bad(`index references missing asset: assets/${r}`);
      } else {
        ok(`asset ${r}`);
      }
    }
    if (!rel.length) warn("no asset refs found in index.html");
  } else {
    for (const r of refs) {
      if (!existsSync(join(DIST, "assets", r))) {
        bad(`index references missing asset: assets/${r}`);
      } else {
        ok(`asset ${r}`);
      }
    }
  }
}

if (!existsSync(join(DIST, "staff-theme.css"))) {
  bad("dist/staff-theme.css missing (plugins need GET /admin/staff-theme.css)");
} else {
  ok("dist/staff-theme.css");
}

const examplePlain = join(WEB, "examples/host-entry.js");
const exampleBuilt = join(WEB, "examples/dist/host-entry.js");
if (existsSync(examplePlain)) ok("examples/host-entry.js");
else warn("examples/host-entry.js missing");
if (existsSync(exampleBuilt)) {
  ok("examples/dist/host-entry.js (built ESM demo)");
} else {
  warn(
    "examples/dist/host-entry.js not built — optional: " +
      "cd examples/host-module && npm i && npm run build",
  );
}

// Router name app required for module addRoute
const router = join(WEB, "ui/src/router/index.ts");
if (existsSync(router)) {
  const src = await Deno.readTextFile(router);
  if (src.includes('name: "app"')) ok('router name: "app"');
  else bad('router missing name: "app" (plugin modules need it)');
  if (src.includes('name: "plugin-embed"')) {
    ok('router name: "plugin-embed"');
  } else {
    bad('router missing plugin-embed');
  }
}

console.log("");
if (errors.length) {
  console.error(`FAILED (${errors.length} error(s), ${warns.length} warn)`);
  Deno.exit(1);
}
console.log(
  `OK${warns.length ? ` (${warns.length} warning(s))` : ""}`,
);
