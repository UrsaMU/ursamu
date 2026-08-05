/**
 * Graduate an embed plugin toward a first-party host Vue view.
 *
 * Usage:
 *   deno task import-plugin ../mytool --route mytool --order 55
 *   deno task import-plugin ../mytool --route mytool --apply
 *
 * --apply: copy/create view, patch router, patch plugin bridge.
 */

import {
  basename,
  dirname,
  fromFileUrl,
  join,
  resolve,
} from "jsr:@std/path@^0.224.0";
import { ensureDir, existsSync } from "jsr:@std/fs@^0.224.0";
import { parse } from "jsr:@std/flags@^0.224.0";
import { patchBridgeSource } from "./patch-bridge.ts";

const SCRIPT_DIR = dirname(fromFileUrl(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, "..");
const UI_VIEWS = join(WEB_ROOT, "ui", "src", "views");
const ROUTER = join(WEB_ROOT, "ui", "src", "router", "index.ts");

const args = parse(Deno.args, {
  string: ["route", "order", "label"],
  boolean: ["help", "apply", "force", "keep-embed"],
  alias: {
    h: "help",
    r: "route",
    o: "order",
    a: "apply",
    f: "force",
  },
});

if (args.help || args._.length === 0) {
  console.log(`
web:import-plugin — graduate embed plugin → host Vue route

Usage:
  deno run -A scripts/import-plugin.ts <plugin-dir> [options]

Options:
  --route, -r <name>   vue-router name (default: dir basename)
  --order, -o <n>      nav order hint (default 55)
  --label <text>       view title (default: Title Case route)
  --apply, -a          write view + patch router + bridge
  --force, -f          overwrite existing view file
  --keep-embed         leave embed: in bridge (migration aid)

Example:
  deno task import-plugin ../demo-tool --route demo-tool --apply
`);
  Deno.exit(args.help ? 0 : 1);
}

const pluginDir = resolve(String(args._[0]));
const routeName = String(args.route ?? "").trim() ||
  basename(pluginDir);
const order = Number(args.order ?? 55) || 55;
const label = String(args.label ?? "").trim() ||
  routeName
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const apply = Boolean(args.apply);
const force = Boolean(args.force);
const keepEmbed = Boolean(args["keep-embed"]);

if (!existsSync(pluginDir)) {
  console.error(`Not found: ${pluginDir}`);
  Deno.exit(1);
}

const viewBase = routeName
  .split(/[-_]/)
  .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
  .join("") + "View";
const viewFile = `${viewBase}.vue`;
const viewPath = join(UI_VIEWS, viewFile);

const hasAdmin = existsSync(join(pluginDir, "admin"));
const pluginViews = [
  join(pluginDir, "ui", "src", "views"),
  join(pluginDir, "ui", "views"),
  join(pluginDir, "src", "views"),
];

const BRIDGE_CANDIDATES = [
  "ui-bridge.ts",
  "staff-nav-bridge.ts",
  "src/staff-nav-bridge.ts",
  "src/ui-bridge.ts",
];

function findSourceView(): string | null {
  for (const dir of pluginViews) {
    if (!existsSync(dir)) continue;
    for (const name of Deno.readDirSync(dir)) {
      if (name.isFile && name.name.endsWith("View.vue")) {
        return join(dir, name.name);
      }
      if (name.isFile && name.name.endsWith(".vue")) {
        return join(dir, name.name);
      }
    }
  }
  return null;
}

function findBridgeFile(): string | null {
  for (const rel of BRIDGE_CANDIDATES) {
    const p = join(pluginDir, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

function stubView(): string {
  return `<script setup lang="ts">
/** Host view graduated from plugin ${basename(pluginDir)}. */
</script>

<template>
  <article
    id="main-${routeName}"
    class="dash-browser"
  >
    <header class="dash-header">
      <div>
        <p class="muted dash-kicker">
          Plugin
        </p>
        <h1 class="page-title">
          ${label}
        </h1>
        <p class="muted">
          Graduated host view — edit
          <code>ui/src/views/${viewFile}</code>.
        </p>
      </div>
    </header>
  </article>
</template>
`;
}

function routeSnippet(): string {
  return `        {
          path: "${routeName}",
          name: "${routeName}",
          component: () => import("@/views/${viewFile}"),
        },`;
}

function patchRouter(src: string): { text: string; changed: boolean } {
  if (src.includes(`name: "${routeName}"`)) {
    return { text: src, changed: false };
  }
  const marker =
    `        {
          path: "ext/:pluginId",
          name: "plugin-embed",`;
  if (!src.includes(marker)) {
    throw new Error(
      "Could not find plugin-embed route marker in router/index.ts",
    );
  }
  const insert = `${routeSnippet()}\n${marker}`;
  return {
    text: src.replace(marker, insert),
    changed: true,
  };
}

const sourceView = findSourceView();
const bridgePath = findBridgeFile();

console.log(`
Plugin:     ${pluginDir}
Route name: ${routeName}
View file:  ui/src/views/${viewFile}
Order hint: ${order}
Mode:       ${apply ? "APPLY" : "dry-run"}
Keep embed: ${keepEmbed}

Layout:
  admin/           ${hasAdmin ? "yes" : "no"}
  source view      ${sourceView ?? "(none — will stub)"}
  bridge           ${bridgePath ?? "(none)"}
`);

if (!apply) {
  console.log(`Dry-run. Would:
  1. ${sourceView ? `Copy ${sourceView}` : "Write stub"} → ${viewPath}
  2. Patch ${ROUTER} with route "${routeName}"
  3. ${
    bridgePath
      ? `Patch bridge ${bridgePath} → route: "${routeName}"`
      : "Skip bridge (not found)"
  }
  4. Remind: deno task ui:build

Re-run with --apply to write files.
`);
  Deno.exit(0);
}

await ensureDir(UI_VIEWS);

if (existsSync(viewPath) && !force) {
  console.log(`View exists (use --force to overwrite): ${viewPath}`);
} else if (sourceView) {
  await Deno.copyFile(sourceView, viewPath);
  console.log(`Copied view → ${viewPath}`);
} else {
  await Deno.writeTextFile(viewPath, stubView());
  console.log(`Wrote stub view → ${viewPath}`);
}

const routerSrc = await Deno.readTextFile(ROUTER);
const { text: nextRouter, changed } = patchRouter(routerSrc);
if (changed) {
  await Deno.writeTextFile(ROUTER, nextRouter);
  console.log(`Patched router → name: "${routeName}"`);
} else {
  console.log(`Router already has name: "${routeName}"`);
}

if (bridgePath) {
  const bsrc = await Deno.readTextFile(bridgePath);
  const b = patchBridgeSource(bsrc, {
    routeName,
    label,
    order,
    keepEmbed,
    pluginId: routeName,
  });
  if (b.changed) {
    await Deno.writeTextFile(bridgePath, b.text);
    console.log(`Patched bridge (${b.note}) → ${bridgePath}`);
  } else {
    console.log(`Bridge unchanged (${b.note})`);
  }
} else {
  console.log("No bridge file found to patch.");
}

console.log(`
Next:
  1. Rebuild staff UI:
       cd packages/web && deno task ui:build

  2. Restart the game process if bridges load at boot.

  3. Open /admin/${routeName}
`);
