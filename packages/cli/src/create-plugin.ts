/**
 * @module cli/create-plugin
 *
 * Plugin scaffold logic for `ursamu create plugin <name>`.
 * Two paths: standalone (publishable repo) and in-tree (src/plugins/).
 *
 * UI flags:
 *   --admin-embed   staff console embed SPA + registerStaffPage
 *   --site-static   public FE page at /site/p/<name>/ + nav/menu
 */

import { join } from "@std/path";
import { existsSync } from "@std/fs";
import {
  standalonePluginIndexTs,
  standalonePluginTestTs,
  inTreePluginSchemasTs,
  inTreePluginCommandsTs,
  inTreeCommandFamilyTs,
  inTreePluginRouterTs,
  inTreePluginIndexTs,
  inTreeHelpMd,
  inTreePluginTestTs,
  showcaseExampleJson,
  standaloneShowcaseTs,
  pluginClaude,
  pluginUiBridgeTs,
  pluginAdminIndexHtml,
  pluginAdminAppJs,
  pluginPublicIndexHtml,
  type PluginUiOpts,
} from "./create-templates.ts";

export interface PluginScaffoldOpts {
  standalone: boolean;
  nonInteractive: boolean;
  desc?: string;
  version?: string;
  author?: string;
  currentDir: string;
  /** Staff embed SPA under admin/ + soft registerStaffPage */
  adminEmbed?: boolean;
  /** Public page under public/ + soft site nav/static/menu */
  siteStatic?: boolean;
}

/** camelCase a kebab-case name: "my-plugin" → "myPlugin" */
function toCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Title-case a kebab-case name: "my-plugin" → "MyPlugin" */
function toTitle(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
    .replace(/\s/g, "");
}

/** Nav label: "my-tool" → "My Tool" */
function toLabel(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

/** Valid plugin id for URL segments (/admin/<id>, /site/p/<id>). */
export function isValidPluginName(name: string): boolean {
  return /^[a-z][a-z0-9_-]*$/i.test(name) &&
    !name.includes("..") &&
    name.length <= 64;
}

async function writeUiScaffold(
  targetDir: string,
  name: string,
  ui: PluginUiOpts,
): Promise<void> {
  const label = ui.label ?? toLabel(name);
  await Deno.writeTextFile(
    join(targetDir, "ui-bridge.ts"),
    pluginUiBridgeTs(name, { ...ui, label }),
  );
  console.log("  Created ui-bridge.ts");

  if (ui.adminEmbed) {
    await Deno.mkdir(join(targetDir, "admin"), { recursive: true });
    await Deno.writeTextFile(
      join(targetDir, "admin", "index.html"),
      pluginAdminIndexHtml(name, label),
    );
    await Deno.writeTextFile(
      join(targetDir, "admin", "app.js"),
      pluginAdminAppJs(name),
    );
    console.log("  Created admin/ (staff embed SPA)");
  }

  if (ui.siteStatic) {
    await Deno.mkdir(join(targetDir, "public"), { recursive: true });
    await Deno.writeTextFile(
      join(targetDir, "public", "index.html"),
      pluginPublicIndexHtml(name, label),
    );
    console.log("  Created public/ (site page at /site/p/" + name + "/)");
  }
}

async function scaffoldStandalone(
  name: string,
  opts: PluginScaffoldOpts,
): Promise<void> {
  const desc = opts.desc ?? (opts.nonInteractive
    ? "A UrsaMU plugin"
    : prompt("Description [A UrsaMU plugin]: ")?.trim() ||
      "A UrsaMU plugin");
  const version = opts.version ?? (opts.nonInteractive
    ? "1.0.0"
    : prompt("Version [1.0.0]: ")?.trim() || "1.0.0");
  const author = opts.author ?? (opts.nonInteractive
    ? ""
    : prompt("Author []: ")?.trim() ?? "");

  const targetDir = join(opts.currentDir, name);
  if (existsSync(targetDir)) {
    console.error(`Error: Directory already exists at ${targetDir}`);
    Deno.exit(1);
  }

  const ui: PluginUiOpts = {
    adminEmbed: Boolean(opts.adminEmbed),
    siteStatic: Boolean(opts.siteStatic),
    label: toLabel(name),
  };
  const hasUi = ui.adminEmbed || ui.siteStatic;

  console.log(`Initializing standalone UrsaMU plugin: ${name}`);
  await Deno.mkdir(join(targetDir, "tests"), { recursive: true });

  await Deno.writeTextFile(
    join(targetDir, "ursamu.plugin.json"),
    JSON.stringify({
      name,
      version,
      description: desc,
      ursamu: ">=1.0.0",
      author,
      license: "MIT",
      main: "index.ts",
    }, null, 2),
  );
  console.log("  Created ursamu.plugin.json");

  const imports: Record<string, string> = {
    ursamu: "jsr:@ursamu/mush",
    "@ursamu/mush": "jsr:@ursamu/mush",
    "@ursamu/ursamu": "jsr:@ursamu/ursamu",
  };
  if (ui.adminEmbed) {
    imports["@ursamu/web"] = "jsr:@ursamu/web";
  }
  if (ui.siteStatic) {
    imports["@ursamu/site"] = "jsr:@ursamu/site";
  }

  await Deno.writeTextFile(
    join(targetDir, "deno.json"),
    JSON.stringify({
      tasks: {
        test: "deno test -A --unstable-kv",
        showcase: "deno run -A tools/showcase.ts",
      },
      imports,
    }, null, 2),
  );
  console.log("  Created deno.json");

  const varName = toCamel(name);
  await Deno.writeTextFile(
    join(targetDir, "index.ts"),
    standalonePluginIndexTs(name, version, desc, varName, ui),
  );
  console.log("  Created index.ts");

  if (hasUi) {
    await writeUiScaffold(targetDir, name, ui);
  }

  await Deno.writeTextFile(
    join(targetDir, "tests", "plugin.test.ts"),
    standalonePluginTestTs(name, version),
  );
  console.log("  Created tests/plugin.test.ts");

  await Deno.mkdir(join(targetDir, "showcases"));
  await Deno.writeTextFile(
    join(targetDir, "showcases", `${name}.json`),
    showcaseExampleJson(name),
  );
  console.log("  Created showcases/" + name + ".json");

  await Deno.mkdir(join(targetDir, "tools"));
  await Deno.writeTextFile(
    join(targetDir, "tools", "showcase.ts"),
    standaloneShowcaseTs(),
  );
  console.log("  Created tools/showcase.ts");

  await Deno.writeTextFile(
    join(targetDir, "CLAUDE.md"),
    pluginClaude(name, true),
  );
  console.log("  Created CLAUDE.md");

  await Deno.writeTextFile(
    join(targetDir, ".gitignore"),
    `.deno/\nnode_modules/\n`,
  );
  console.log("  Created .gitignore");

  const uiNotes: string[] = [];
  if (ui.adminEmbed) {
    uiNotes.push(
      `  Staff embed: /admin/ext/${name} (files in admin/)`,
    );
  }
  if (ui.siteStatic) {
    uiNotes.push(
      `  Public page: /site/p/${name}/ (files in public/)`,
    );
  }

  console.log(`
Standalone plugin "${name}" created at ./${name}/

  cd ${name}
  npx @lhi/ursamu-dev          # install the dev skill (do this first)
  deno task test               # run tests
  deno task showcase --list    # preview showcases
${uiNotes.length ? "\n" + uiNotes.join("\n") + "\n" : ""}
Ship ursamu.plugin.json at the repo root so users can install via:
  ursamu plugin install https://github.com/you/${name}
`);
}

async function scaffoldInTree(
  name: string,
  opts: PluginScaffoldOpts,
): Promise<void> {
  const currentDir = opts.currentDir;
  const pluginsDir = join(currentDir, "src", "plugins");
  const pluginDir = join(pluginsDir, name);

  if (existsSync(pluginDir)) {
    console.error(
      `Error: Plugin directory already exists at ${pluginDir}`,
    );
    Deno.exit(1);
  }

  if (!existsSync(pluginsDir)) {
    await Deno.mkdir(pluginsDir, { recursive: true });
  }
  await Deno.mkdir(pluginDir);

  console.log(`Creating plugin: ${name}`);

  const title = toTitle(name);
  const varName = toCamel(name);
  const handlerName = `${varName}RouteHandler`;
  const ui: PluginUiOpts = {
    adminEmbed: Boolean(opts.adminEmbed),
    siteStatic: Boolean(opts.siteStatic),
    label: toLabel(name),
  };
  const hasUi = ui.adminEmbed || ui.siteStatic;

  await Deno.mkdir(join(pluginDir, "db"));
  await Deno.writeTextFile(
    join(pluginDir, "db", "schemas.ts"),
    inTreePluginSchemasTs(name, title),
  );
  console.log("  Created db/schemas.ts");

  await Deno.mkdir(join(pluginDir, "commands"));
  await Deno.writeTextFile(
    join(pluginDir, "commands.ts"),
    inTreePluginCommandsTs(name),
  );
  console.log("  Created commands.ts");
  await Deno.writeTextFile(
    join(pluginDir, "commands", `${name}.ts`),
    inTreeCommandFamilyTs(name, title),
  );
  console.log(`  Created commands/${name}.ts`);

  await Deno.writeTextFile(
    join(pluginDir, "router.ts"),
    inTreePluginRouterTs(name, handlerName),
  );
  console.log("  Created router.ts");
  await Deno.writeTextFile(
    join(pluginDir, "index.ts"),
    inTreePluginIndexTs(name, handlerName, varName, ui),
  );
  console.log("  Created index.ts");

  if (hasUi) {
    await writeUiScaffold(pluginDir, name, ui);
  }

  await Deno.mkdir(join(pluginDir, "help"));
  await Deno.writeTextFile(
    join(pluginDir, "help", `${name}.md`),
    inTreeHelpMd(name),
  );
  console.log(`  Created help/${name}.md`);

  await Deno.mkdir(join(pluginDir, "tests"));
  await Deno.writeTextFile(
    join(pluginDir, "tests", "plugin.test.ts"),
    inTreePluginTestTs(name),
  );
  console.log("  Created tests/plugin.test.ts");

  await Deno.mkdir(join(pluginDir, "showcases"));
  await Deno.writeTextFile(
    join(pluginDir, "showcases", `${name}.json`),
    showcaseExampleJson(name),
  );
  console.log("  Created showcases/" + name + ".json");

  await Deno.writeTextFile(
    join(pluginDir, "CLAUDE.md"),
    pluginClaude(name, false),
  );
  console.log("  Created CLAUDE.md");

  const uiLines: string[] = [];
  if (ui.adminEmbed) {
    uiLines.push(
      `  admin/                    — staff embed SPA → /admin/${name}/`,
    );
    uiLines.push(
      `  ui-bridge.ts              — registerStaffPage + registerStaffStatic`,
    );
  }
  if (ui.siteStatic) {
    uiLines.push(
      `  public/                   — site page → /site/p/${name}/`,
    );
    if (!ui.adminEmbed) {
      uiLines.push(
        `  ui-bridge.ts              — registerSiteNav/Static/MenuBlock`,
      );
    }
  }

  console.log(`
Plugin '${name}' scaffolded at src/plugins/${name}/

  CLAUDE.md                   — plugin context + dev skill setup
  index.ts                    — plugin entry point (init, remove, registerHelpDir)
  commands.ts                 — barrel: one import per command family
  commands/${name}.ts         — addCmd() registrations for the ${name} family
  router.ts                   — REST handler for /api/v1/${name}
  db/schemas.ts               — type definitions (DBO instances go in command files)
  help/${name}.md             — in-game help text (served by help-plugin)
  tests/plugin.test.ts        — Deno unit tests
  showcases/${name}.json      — showcase / demo steps
${uiLines.length ? uiLines.join("\n") + "\n" : ""}
Next: npx @lhi/ursamu-dev  (install the dev skill)
      deno task showcase ${name}-basic
The plugin is auto-discovered — no registration needed.
${
    hasUi
      ? `
Ensure the game loads @ursamu/web and/or @ursamu/site and has them
in deno.json imports so ui-bridge soft-imports succeed.
`
      : ""
  }`);
}

export async function scaffoldPlugin(
  pluginName: string,
  opts: PluginScaffoldOpts,
): Promise<void> {
  const name = pluginName.trim().toLowerCase();
  if (!isValidPluginName(name)) {
    console.error(
      `Error: Invalid plugin name "${pluginName}". ` +
        `Use a letter start, then letters/digits/hyphen/underscore ` +
        `(e.g. my-tool).`,
    );
    Deno.exit(1);
  }

  if (opts.standalone) {
    await scaffoldStandalone(name, opts);
  } else {
    await scaffoldInTree(name, opts);
  }
}
