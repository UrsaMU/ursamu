/**
 * @module cli/create-project
 *
 * Game project scaffold logic for `ursamu create <project-name>`.
 */

import { join, fromFileUrl } from "@std/path";
import { GAME_PROJECT_TASKS, LOCAL_PLUGINS_MANIFEST } from "./game-project-tasks.ts";
import { optionalPackages } from "./packages.ts";
import {
  gameMainTs,
  gameTelnetTs,
  gameRunSh,
  gameDaemonSh,
  gameStopSh,
  gameRestartSh,
  gameStatusSh,
  gamePortsSh,
  gameSafeUpdateSh,
  gameEnvFile,
  gameConnectTxt,
  gameWikiHome,
  gameWikiRulesApproval,
  gameWikiRulesConduct,
  gameWikiCommandsBasic,
  gameWikiHelpStaff,
  gameGitignore,
  gameReadme,
  gameClaude,
  gameConfigJson,
  gameAgents,
  gameGemini,
} from "./create-templates.ts";

async function writeConnectTxt(targetDir: string, name: string): Promise<void> {
  const engineFile = new URL("../../../text/default_connect.txt", import.meta.url);
  let content: string | null = null;

  if (engineFile.protocol === "file:") {
    try {
      content = await Deno.readTextFile(fromFileUrl(engineFile));
    } catch { /* fall through to template */ }
  } else {
    try {
      const res = await fetch(engineFile.toString());
      if (res.ok) content = await res.text();
    } catch { /* fall through to template */ }
  }

  await Deno.writeTextFile(
    join(targetDir, "text", "default_connect.txt"),
    content ?? gameConnectTxt(name),
  );
}

const PLUGIN_SCRIPTS = new Set([
  "chancreate", "chandestroy", "channels", "chanset",
  "chanhistory", "chantranscript", "comaliases", "demo",
]);

const FALLBACK_SCRIPTS = [
  "admin","alias","assert","away","cemit","connect","create",
  "decompile","doing","drop","emit","entrances","find","flags","forceCmd","format","fsay",
  "get","give","home","inventory","last","lemit","look","ltag",
  "mail","mailadd","moniker","motd","page","password","pemit","poll","pose","quit",
  "remit","say","score","search","stats","sweep","switch","tag","tel","teleport",
  "think","time","trigger","update","wall","whisper","who",
];

async function copySystemScripts(targetDir: string): Promise<void> {
  const engineScriptsBase = new URL("../../../system/scripts/", import.meta.url);
  let scriptNames: string[] = [];

  if (engineScriptsBase.protocol === "file:") {
    try {
      for await (const e of Deno.readDir(fromFileUrl(engineScriptsBase))) {
        if (e.isFile && e.name.endsWith(".ts")) scriptNames.push(e.name.replace(".ts", ""));
      }
    } catch { /* fall through */ }
  }

  if (scriptNames.length === 0) scriptNames = FALLBACK_SCRIPTS;

  let copied = 0;
  for (const name of scriptNames) {
    if (PLUGIN_SCRIPTS.has(name)) continue;
    const url = new URL(`${name}.ts`, engineScriptsBase);
    try {
      const content = url.protocol === "file:"
        ? await Deno.readTextFile(fromFileUrl(url))
        : await fetch(url.toString()).then((r) => r.ok ? r.text() : Promise.reject());
      await Deno.writeTextFile(join(targetDir, "system", "scripts", `${name}.ts`), content);
      copied++;
    } catch { /* skip missing */ }
  }
  console.log(`Created system/scripts/ (${copied} scripts)`);
}

/**
 * Game-level ./help/ is optional site overrides only.
 * Plugin topics load from each package's help/ via registerHelpDir
 * (local file: or JSR https://) — do not vendor package help here.
 */
async function noteHelpDir(targetDir: string): Promise<void> {
  const dest = join(targetDir, "help");
  await Deno.mkdir(dest, { recursive: true });
  await Deno.writeTextFile(
    join(dest, "README.md"),
    [
      "# Site help overrides",
      "",
      "Put game-specific `.md` topics here only.",
      "Plugin help lives in each package's `help/` folder and is",
      "registered with `registerHelpDir` — the FileProvider loads",
      "it from the package (local checkout or JSR publish).",
      "",
    ].join("\n"),
  );
  console.log(
    "Created help/ (overrides only — plugins ship their own help)",
  );
}

export interface ProjectScaffoldOpts {
  isLocal: boolean;
  engineRelPath: string;
  targetDir: string;
  selectedPackages?: string[];
}

export async function scaffoldProject(
  name: string,
  opts: ProjectScaffoldOpts,
): Promise<void> {
  const { isLocal, engineRelPath, targetDir } = opts;

  console.log(`Creating new UrsaMU ${isLocal ? "test " : ""}project: ${name}`);
  await Deno.mkdir(targetDir);

  for (const dir of [
    ".agents",
    "config",
    "data",
    "src",
    "src/plugins",
    "text",
    "help",
    "scripts",
    "system/scripts",
    "wiki",
    "wiki/rules",
    "wiki/commands",
    "wiki/help",
  ]) {
    await Deno.mkdir(join(targetDir, dir), { recursive: true });
    console.log(`Created directory: ${dir}`);
  }

  const pluginsManifest = isLocal ? LOCAL_PLUGINS_MANIFEST : { plugins: [] };
  await Deno.writeTextFile(
    join(targetDir, "src", "plugins", "plugins.manifest.json"),
    JSON.stringify(pluginsManifest, null, 2),
  );
  console.log(`Created src/plugins/plugins.manifest.json (${isLocal ? "local symlinks" : "empty remote"} mode)`);

  await Deno.writeTextFile(join(targetDir, "wiki", "home.md"), gameWikiHome(name));
  await Deno.writeTextFile(join(targetDir, "wiki", "rules", "approval.md"), gameWikiRulesApproval(name));
  await Deno.writeTextFile(join(targetDir, "wiki", "rules", "conduct.md"), gameWikiRulesConduct(name));
  await Deno.writeTextFile(join(targetDir, "wiki", "commands", "basic.md"), gameWikiCommandsBasic(name));
  await Deno.writeTextFile(join(targetDir, "wiki", "help", "staff.md"), gameWikiHelpStaff(name));
  console.log("Created default wiki pages in wiki/");

  await copySystemScripts(targetDir);
  await noteHelpDir(targetDir);

  await Deno.writeTextFile(join(targetDir, "src", "main.ts"),   gameMainTs(name, isLocal));
  console.log("Created src/main.ts");
  await Deno.writeTextFile(join(targetDir, "src", "telnet.ts"), gameTelnetTs());
  console.log("Created src/telnet.ts");
  const shellScripts: Array<[string, string]> = [
    ["_ports.sh", await gamePortsSh()],
    ["run.sh", await gameRunSh(name)],
    ["daemon.sh", await gameDaemonSh()],
    ["stop.sh", await gameStopSh()],
    ["restart.sh", await gameRestartSh()],
    ["status.sh", await gameStatusSh()],
    ["safe-update.sh", gameSafeUpdateSh()],
  ];
  for (const [file, content] of shellScripts) {
    const path = join(targetDir, "scripts", file);
    await Deno.writeTextFile(path, content);
    try { await Deno.chmod(path, 0o755); } catch { /* non-fatal */ }
    console.log(`Created scripts/${file}`);
  }

  // Stable JWT secret so telnet auto-reauth survives main-server restarts.
  const jwtBytes = new Uint8Array(32);
  crypto.getRandomValues(jwtBytes);
  const jwtSecret = Array.from(jwtBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await Deno.writeTextFile(
    join(targetDir, ".env"),
    gameEnvFile().replace("__JWT_SECRET__", jwtSecret),
  );
  console.log("Created .env configuration file");

  await writeConnectTxt(targetDir, name);
  console.log("Created text/default_connect.txt");

  // Default “full portal” stack for new games (public site + staff).
  const defaultPkgs = [
    "@ursamu/builder",
    "@ursamu/channels",
    "@ursamu/help",
    "@ursamu/bbs",
    "@ursamu/mail",
    "@ursamu/wiki",
    "@ursamu/web",
    "@ursamu/site",
  ];
  // Automatically resolve and include required peer dependencies in correct order:
  // - @ursamu/cofd-plugin -> @ursamu/help, @ursamu/jobs, @ursamu/combat
  // - @ursamu/dnd-plugin  -> @ursamu/help, @ursamu/vendor-plugin, @ursamu/combat
  // - @ursamu/jobs-plugin / @ursamu/jobs -> @ursamu/help
  // - @ursamu/mail / @ursamu/bbs / @ursamu/wiki -> @ursamu/help
  function resolvePeerDependencies(pkgs: string[]): string[] {
    const set = new Set(pkgs);

    if (set.has("@ursamu/cofd-plugin") || set.has("@ursamu/cofd")) {
      set.add("@ursamu/help");
      set.add("@ursamu/jobs");
      set.add("@ursamu/combat");
    }
    if (set.has("@ursamu/dnd-plugin")) {
      set.add("@ursamu/help");
      set.add("@ursamu/vendor-plugin");
      set.add("@ursamu/combat");
    }
    if (set.has("@ursamu/jobs") || set.has("@ursamu/mail") || set.has("@ursamu/bbs") || set.has("@ursamu/wiki") || set.has("@ursamu/discord")) {
      set.add("@ursamu/help");
    }

    // Topological order for config.json server.plugins
    const order = [
      "@ursamu/globals",
      "@ursamu/help",
      "@ursamu/jobs",
      "@ursamu/vendor-plugin",
      "@ursamu/combat",
      "@ursamu/bbs",
      "@ursamu/mail",
      "@ursamu/wiki",
      "@ursamu/channels",
      "@ursamu/builder",
      "@ursamu/cofd-plugin",
      "@ursamu/cofd",
      "@ursamu/dnd-plugin",
      "@ursamu/d20-modern-plugin",
      "@ursamu/mekton-zeta",
      "@ursamu/fabula-plugin",
      "@ursamu/lang-plugin",
      "@ursamu/discord",
      "@ursamu/map-plugin",
      "@ursamu/events",
      "@ursamu/web",
      "@ursamu/site",
    ];

    const result: string[] = [];
    for (const item of order) {
      if (set.has(item)) {
        result.push(item);
        set.delete(item);
      }
    }
    // Append any custom plugins
    for (const item of set) {
      result.push(item);
    }
    return result;
  }

  const selections = resolvePeerDependencies(opts.selectedPackages ?? defaultPkgs);

  const configJson = gameConfigJson(name, selections);
  await Deno.writeTextFile(
    join(targetDir, "config", "config.json"),
    configJson,
  );
  await Deno.writeTextFile(
    join(targetDir, "config", "config.sample.json"),
    configJson,
  );
  console.log(
    "Created config/config.json and config/config.sample.json",
  );

  const localImports: Record<string, string> = {
    "ursamu": `${engineRelPath}/packages/mush/mod.ts`,
    "ursamu/": `${engineRelPath}/packages/mush/`,
    "@ursamu/mush": `${engineRelPath}/packages/mush/mod.ts`,
    "@ursamu/mush/": `${engineRelPath}/packages/mush/`,
    "@ursamu/core": `${engineRelPath}/packages/core/mod.ts`,
    "@ursamu/mush/app":
      `${engineRelPath}/packages/mush/src/app.ts`,
    "@ursamu/channels":
      `${engineRelPath}/packages/channels/mod.ts`,
    "@ursamu/channels/channel-events":
      `${engineRelPath}/packages/channels/src/channel-events.ts`,
    "@ursamu/jobs":
      `${engineRelPath}/packages/jobs/mod.ts`,
    "@std/assert": "jsr:@std/assert@^0.224.0",
    "@std/flags": "jsr:@std/flags@^0.224.0",
    "@std/fmt": "jsr:@std/fmt@^0.224.0",
    "@std/fmt/": "jsr:@std/fmt@^0.224.0/",
    "@std/fs": "jsr:@std/fs@^0.224.0",
    "@std/path": "jsr:@std/path@^0.224.0",
    "@std/semver": "jsr:@std/semver@^1.0.0",
    "@std/testing": "jsr:@std/testing@^1.0.17",
    "@std/testing/bdd": "jsr:@std/testing@^1.0.17/bdd",
    "@std/testing/mock": "jsr:@std/testing@^1.0.17/mock",
    "@ursamu/mushcode": "jsr:@ursamu/mushcode@^0.7.0",
    "@ursamu/mushcode/eval": "jsr:@ursamu/mushcode@^0.7.0/eval",
    "@ursamu/mushcode/parse": "jsr:@ursamu/mushcode@^0.7.0/parse",
    "@ursamu/parser": "npm:@ursamu/parser@1.2.4",
    "@digibear/tags": "npm:@digibear/tags@1.0.0",
    "bcrypt": "npm:bcryptjs@2.4.3",
    "djwt": "jsr:@zaubrik/djwt@^3.0.2",
    "dotenv": "jsr:@std/dotenv@^0.224.0",
    "dotenv/": "jsr:@std/dotenv@^0.224.0/",
    "dotenv/load": "jsr:@std/dotenv@^0.224.0/load",
    "lodash": "npm:lodash@^4.18.1",
    "quickjs-emscripten": "npm:quickjs-emscripten@0.29.0",
    "@electric-sql/pglite": "npm:@electric-sql/pglite@^0.5.2",
    "@nicia-ai/typegraph": "npm:@nicia-ai/typegraph@^0.31.0",
    "@nicia-ai/typegraph/postgres/pglite":
      "npm:@nicia-ai/typegraph@^0.31.0/postgres/pglite",
    "zod": "npm:zod@4.4.3",
    "sucrase": "npm:sucrase@^3.35.0",
  };

  // Engine pins: keep in sync with published @ursamu/mush + core.
  // Dual-package override keys force plugin range rewrites onto one
  // mush/core instance (see packages/mush/docs/DUAL_PACKAGE.md).
  const MUSH = "jsr:@ursamu/mush@1.0.38";
  const CORE = "jsr:@ursamu/core@1.0.5";
  const jsrImports: Record<string, string> = {
    "ursamu": MUSH,
    "@ursamu/mush": MUSH,
    "@ursamu/mush/app": `${MUSH}/app`,
    "@ursamu/core": CORE,
    "@std/path": "jsr:@std/path@^0.224.0",
    "@std/assert": "jsr:@std/assert@^0.224.0",
    "@std/fs": "jsr:@std/fs@^0.224.0",
    "@std/dotenv": "jsr:@std/dotenv@^0.224.0",
    "dotenv": "jsr:@std/dotenv@^0.224.0",
    "dotenv/load": "jsr:@std/dotenv@^0.224.0/load",
    "@electric-sql/pglite": "npm:@electric-sql/pglite@^0.5.2",
    "@nicia-ai/typegraph": "npm:@nicia-ai/typegraph@^0.31.0",
    "@nicia-ai/typegraph/postgres/pglite":
      "npm:@nicia-ai/typegraph@^0.31.0/postgres/pglite",
    "zod": "npm:zod@4.4.3",
    "bcrypt": "npm:bcryptjs@2.4.3",
    "@ursamu/parser": "npm:@ursamu/parser@1.2.4",
    "@digibear/tags": "npm:@digibear/tags@1.0.0",
    "djwt": "jsr:@zaubrik/djwt@^3.0.2",
    "quickjs-emscripten": "npm:quickjs-emscripten@0.29.0",
    "sucrase": "npm:sucrase@^3.35.0",
    "@ursamu/mushcode": "jsr:@ursamu/mushcode@^0.7.0",
    "@ursamu/mushcode/eval": "jsr:@ursamu/mushcode@^0.7.0/eval",
    "@ursamu/mushcode/parse": "jsr:@ursamu/mushcode@^0.7.0/parse",
    // Dual-instance force (plugin publish rewrites)
    "jsr:@ursamu/mush@^1.0.0": MUSH,
    "jsr:@ursamu/mush@^1.0.30": MUSH,
    "jsr:@ursamu/mush@^0.1.1": MUSH,
    "jsr:@ursamu/mush@^0.2.0": MUSH,
    "jsr:@ursamu/core@^1.0.0": CORE,
    "jsr:@ursamu/core@^1.0.2": CORE,
  };

  function getLocalPath(pkgName: string, engineRelPath: string): string {
    if (pkgName === "@ursamu/globals") {
      return `${engineRelPath}/packages/cofd/tests/helpers/globals-shim.ts`;
    }
    const slug = pkgName.replace("@ursamu/", "");
    const base = slug
      .replace(/-plugin$/, "")
      .replace(/^mekton-zeta$/, "mekton");
    const entry =
      (base === "cofd" ||
          base === "lang" ||
          base === "vendor" ||
          base === "dnd" ||
          base === "discord")
        ? "index.ts"
        : "mod.ts";
    return `${engineRelPath}/packages/${base}/${entry}`;
  }

  for (const pkgName of selections) {
    const matchedOpt = optionalPackages.find((o) => o.pkgName === pkgName);
    if (isLocal) {
      localImports[pkgName] = getLocalPath(pkgName, engineRelPath);
      if (pkgName === "@ursamu/help") {
        localImports["@ursamu/help/register"] =
          `${engineRelPath}/packages/help/register.ts`;
      }
    } else if (matchedOpt) {
      jsrImports[pkgName] = matchedOpt.jsrUrl;
      if (pkgName === "@ursamu/help") {
        jsrImports["@ursamu/help/register"] =
          "jsr:@ursamu/help@^1.2.0/register";
      }
    }
  }
  const denoJson = JSON.stringify({
    nodeModulesDir: "auto",
    // Allow brand-new JSR publishes (Deno default is 24h age gate).
    minimumDependencyAge: "0",
    tasks: GAME_PROJECT_TASKS,
    compilerOptions: {
      lib: ["deno.window", "deno.unstable"],
    },
    imports: isLocal ? localImports : jsrImports,
  }, null, 2);

  await Deno.writeTextFile(join(targetDir, "deno.json"), denoJson);
  console.log("Created deno.json");

  await Deno.writeTextFile(join(targetDir, "README.md"), gameReadme(name));
  console.log("Created README.md");
  await Deno.writeTextFile(join(targetDir, "CLAUDE.md"), gameClaude(name));
  console.log("Created CLAUDE.md");
  await Deno.writeTextFile(join(targetDir, "GEMINI.md"), gameGemini(name));
  console.log("Created GEMINI.md");
  await Deno.writeTextFile(
    join(targetDir, ".agents", "AGENTS.md"),
    gameAgents(name),
  );
  console.log("Created .agents/AGENTS.md");
  await Deno.writeTextFile(join(targetDir, ".gitignore"), gameGitignore());
  console.log("Created .gitignore");

  if (isLocal) {
    console.log(`
Test project "${name}" created with local engine linkage!

Imports resolve to: ${engineRelPath}/packages/mush/mod.ts

  cd ${name}
  deno task server   # main server (watch mode)
  deno task telnet   # telnet server
`);
  } else {
    console.log(`
Project ${name} created successfully!

  cd ${name}
  deno task start
`);
  }
}
