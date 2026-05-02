/**
 * @module cli/create-plugin
 *
 * Plugin scaffold logic for `ursamu create plugin <name>`.
 * Two paths: standalone (publishable repo) and in-tree (src/plugins/).
 */

import { join } from "jsr:@std/path@^0.224.0";
import { existsSync } from "jsr:@std/fs@^0.224.0";
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
} from "./create-templates.ts";

export interface PluginScaffoldOpts {
  standalone: boolean;
  nonInteractive: boolean;
  desc?: string;
  version?: string;
  author?: string;
  currentDir: string;
}

/** camelCase a kebab-case name: "my-plugin" → "myPlugin" */
function toCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Title-case a kebab-case name: "my-plugin" → "MyPlugin" */
function toTitle(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()).replace(/\s/g, "");
}

async function scaffoldStandalone(
  name: string,
  opts: PluginScaffoldOpts,
): Promise<void> {
  const desc = opts.desc ?? (opts.nonInteractive
    ? "A UrsaMU plugin"
    : prompt("Description [A UrsaMU plugin]: ")?.trim() || "A UrsaMU plugin");
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

  console.log(`Initializing standalone UrsaMU plugin: ${name}`);
  await Deno.mkdir(join(targetDir, "tests"), { recursive: true });

  await Deno.writeTextFile(
    join(targetDir, "ursamu.plugin.json"),
    JSON.stringify({ name, version, description: desc, ursamu: ">=1.0.0", author, license: "MIT", main: "index.ts" }, null, 2),
  );
  console.log("  Created ursamu.plugin.json");

  await Deno.writeTextFile(
    join(targetDir, "deno.json"),
    JSON.stringify({
      tasks: {
        test:     "deno test -A --unstable-kv",
        showcase: "deno run -A tools/showcase.ts",
      },
      imports: { ursamu: "jsr:@ursamu/ursamu" },
    }, null, 2),
  );
  console.log("  Created deno.json");

  const varName = toCamel(name);
  await Deno.writeTextFile(join(targetDir, "index.ts"), standalonePluginIndexTs(name, version, desc, varName));
  console.log("  Created index.ts");

  await Deno.writeTextFile(join(targetDir, "tests", "plugin.test.ts"), standalonePluginTestTs(name, version));
  console.log("  Created tests/plugin.test.ts");

  await Deno.mkdir(join(targetDir, "showcases"));
  await Deno.writeTextFile(join(targetDir, "showcases", `${name}.json`), showcaseExampleJson(name));
  console.log("  Created showcases/" + name + ".json");

  await Deno.mkdir(join(targetDir, "tools"));
  await Deno.writeTextFile(join(targetDir, "tools", "showcase.ts"), standaloneShowcaseTs());
  console.log("  Created tools/showcase.ts");

  await Deno.writeTextFile(join(targetDir, "CLAUDE.md"), pluginClaude(name, true));
  console.log("  Created CLAUDE.md");

  await Deno.writeTextFile(join(targetDir, ".gitignore"), `.deno/\nnode_modules/\n`);
  console.log("  Created .gitignore");

  console.log(`
Standalone plugin "${name}" created at ./${name}/

  cd ${name}
  npx @lhi/ursamu-dev          # install the dev skill (do this first)
  deno task test               # run tests
  deno task showcase --list    # preview showcases

Ship ursamu.plugin.json at the repo root so users can install via:
  ursamu plugin install https://github.com/you/${name}
`);
}

async function scaffoldInTree(name: string, currentDir: string): Promise<void> {
  const pluginsDir = join(currentDir, "src", "plugins");
  const pluginDir  = join(pluginsDir, name);

  if (existsSync(pluginDir)) {
    console.error(`Error: Plugin directory already exists at ${pluginDir}`);
    Deno.exit(1);
  }

  if (!existsSync(pluginsDir)) await Deno.mkdir(pluginsDir, { recursive: true });
  await Deno.mkdir(pluginDir);

  console.log(`Creating plugin: ${name}`);

  const title       = toTitle(name);
  const varName     = toCamel(name);
  const handlerName = `${varName}RouteHandler`;

  // db/schemas.ts — types only, no DBO instances
  await Deno.mkdir(join(pluginDir, "db"));
  await Deno.writeTextFile(join(pluginDir, "db", "schemas.ts"), inTreePluginSchemasTs(name, title));
  console.log("  Created db/schemas.ts");

  // commands.ts barrel + commands/<name>.ts family stub
  await Deno.mkdir(join(pluginDir, "commands"));
  await Deno.writeTextFile(join(pluginDir, "commands.ts"),                   inTreePluginCommandsTs(name));
  console.log("  Created commands.ts");
  await Deno.writeTextFile(join(pluginDir, "commands", `${name}.ts`),        inTreeCommandFamilyTs(name, title));
  console.log(`  Created commands/${name}.ts`);

  await Deno.writeTextFile(join(pluginDir, "router.ts"),                     inTreePluginRouterTs(name, handlerName));
  console.log("  Created router.ts");
  await Deno.writeTextFile(join(pluginDir, "index.ts"),                      inTreePluginIndexTs(name, handlerName, varName));
  console.log("  Created index.ts");

  // help/ directory — served by help-plugin FileProvider
  await Deno.mkdir(join(pluginDir, "help"));
  await Deno.writeTextFile(join(pluginDir, "help", `${name}.md`), inTreeHelpMd(name));
  console.log(`  Created help/${name}.md`);

  // tests/ directory
  await Deno.mkdir(join(pluginDir, "tests"));
  await Deno.writeTextFile(join(pluginDir, "tests", "plugin.test.ts"), inTreePluginTestTs(name));
  console.log("  Created tests/plugin.test.ts");

  // showcases/
  await Deno.mkdir(join(pluginDir, "showcases"));
  await Deno.writeTextFile(join(pluginDir, "showcases", `${name}.json`), showcaseExampleJson(name));
  console.log("  Created showcases/" + name + ".json");

  await Deno.writeTextFile(join(pluginDir, "CLAUDE.md"), pluginClaude(name, false));
  console.log("  Created CLAUDE.md");

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

Next: npx @lhi/ursamu-dev  (install the dev skill)
      deno task showcase ${name}-basic
The plugin is auto-discovered — no registration needed.
`);
}

export async function scaffoldPlugin(
  pluginName: string,
  opts: PluginScaffoldOpts,
): Promise<void> {
  if (opts.standalone) {
    await scaffoldStandalone(pluginName, opts);
  } else {
    await scaffoldInTree(pluginName, opts.currentDir);
  }
}
