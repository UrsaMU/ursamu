/**
 * @module cli/create-project
 *
 * Game project scaffold logic for `ursamu create <project-name>`.
 */

import { join, fromFileUrl } from "jsr:@std/path@^0.224.0";
import { GAME_PROJECT_TASKS, DEFAULT_PLUGINS_MANIFEST } from "./game-project-tasks.ts";
import {
  gameMainTs,
  gameTelnetTs,
  gameRunSh,
  gameDaemonSh,
  gameStopSh,
  gameRestartSh,
  gameStatusSh,
  gameEnvFile,
  gameConnectTxt,
  gameWikiHome,
  gameGitignore,
  gameReadme,
  gameClaude,
} from "./create-templates.ts";

async function writeConnectTxt(targetDir: string, name: string): Promise<void> {
  const engineFile = new URL("../../text/default_connect.txt", import.meta.url);
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
  const engineScriptsBase = new URL("../../system/scripts/", import.meta.url);
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

export interface ProjectScaffoldOpts {
  isLocal: boolean;
  engineRelPath: string;
  targetDir: string;
}

export async function scaffoldProject(
  name: string,
  opts: ProjectScaffoldOpts,
): Promise<void> {
  const { isLocal, engineRelPath, targetDir } = opts;

  console.log(`Creating new UrsaMU ${isLocal ? "test " : ""}project: ${name}`);
  await Deno.mkdir(targetDir);

  for (const dir of ["config","data","src","src/plugins","text","help","scripts","system/scripts","wiki"]) {
    await Deno.mkdir(join(targetDir, dir), { recursive: true });
    console.log(`Created directory: ${dir}`);
  }

  await Deno.writeTextFile(
    join(targetDir, "src", "plugins", "plugins.manifest.json"),
    JSON.stringify(DEFAULT_PLUGINS_MANIFEST, null, 2),
  );
  console.log("Created src/plugins/plugins.manifest.json");

  await Deno.writeTextFile(join(targetDir, "wiki", "home.md"), gameWikiHome(name));
  console.log("Created wiki/home.md");

  await copySystemScripts(targetDir);

  await Deno.writeTextFile(join(targetDir, "src", "main.ts"),   gameMainTs(name));
  console.log("Created src/main.ts");
  await Deno.writeTextFile(join(targetDir, "src", "telnet.ts"), gameTelnetTs());
  console.log("Created src/telnet.ts");
  const shellScripts: Array<[string, string]> = [
    ["run.sh",     gameRunSh(name)],
    ["daemon.sh",  gameDaemonSh()],
    ["stop.sh",    gameStopSh()],
    ["restart.sh", gameRestartSh()],
    ["status.sh",  gameStatusSh()],
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
  console.log("Created .env (with generated JWT_SECRET)");

  await writeConnectTxt(targetDir, name);
  console.log("Created text/default_connect.txt");

  const localImports = {
    "ursamu":                  `${engineRelPath}/mod.ts`,
    "ursamu/":                 `${engineRelPath}/`,
    "@ursamu/ursamu":          `${engineRelPath}/mod.ts`,
    "@ursamu/ursamu/app":      `${engineRelPath}/src/app.ts`,
    "@ursamu/ursamu/channels": `${engineRelPath}/src/services/channel-events.ts`,
    "@ursamu/ursamu/chargen":  `${engineRelPath}/src/services/Chargen/index.ts`,
    "@ursamu/ursamu/jobs":     `${engineRelPath}/src/plugins/jobs/mod.ts`,
    "@std/assert":             "jsr:@std/assert@^0.224.0",
    "@std/flags":              "jsr:@std/flags@^0.224.0",
    "@std/fmt":                "jsr:@std/fmt@^0.224.0",
    "@std/fmt/":               "jsr:@std/fmt@^0.224.0/",
    "@std/fs":                 "jsr:@std/fs@^0.224.0",
    "@std/path":               "jsr:@std/path@^0.224.0",
    "@std/semver":             "jsr:@std/semver@^1.0.0",
    "@std/testing":            "jsr:@std/testing@^1.0.17",
    "@std/testing/bdd":        "jsr:@std/testing@^1.0.17/bdd",
    "@std/testing/mock":       "jsr:@std/testing@^1.0.17/mock",
    "@ursamu/mushcode":        "jsr:@ursamu/mushcode@^0.6.0",
    "@ursamu/mushcode/eval":   "jsr:@ursamu/mushcode@^0.6.0/eval",
    "@ursamu/mushcode/parse":  "jsr:@ursamu/mushcode@^0.6.0/parse",
    "@ursamu/parser":          "npm:@ursamu/parser@1.2.4",
    "@digibear/tags":          "npm:@digibear/tags@1.0.0",
    "bcrypt":                  "npm:bcryptjs@2.4.3",
    "djwt":                    "jsr:@zaubrik/djwt@^3.0.2",
    "dotenv":                  "jsr:@std/dotenv@^0.224.0",
    "dotenv/":                 "jsr:@std/dotenv@^0.224.0/",
    "dotenv/load":             "jsr:@std/dotenv@^0.224.0/load",
    "lodash":                  "npm:lodash@^4.18.1",
    "quickjs-emscripten":      "npm:quickjs-emscripten@0.29.0",
  };
  const jsrImports = {
    "ursamu":         "jsr:@ursamu/ursamu",
    "@ursamu/ursamu": "jsr:@ursamu/ursamu",
    "@std/path":      "jsr:@std/path@^0.224.0",
    "@std/assert":    "jsr:@std/assert@^0.224.0",
    "@std/fs":        "jsr:@std/fs@^0.224.0",
  };
  const denoJson = JSON.stringify({
    nodeModulesDir: "auto",
    tasks: GAME_PROJECT_TASKS,
    compilerOptions: {
      lib: ["deno.window"],
      types: ["./node_modules/@types/node/index.d.ts"],
    },
    imports: isLocal ? localImports : jsrImports,
  }, null, 2);

  await Deno.writeTextFile(join(targetDir, "deno.json"), denoJson);
  console.log("Created deno.json");

  await Deno.writeTextFile(join(targetDir, "README.md"), gameReadme(name));
  console.log("Created README.md");
  await Deno.writeTextFile(join(targetDir, "CLAUDE.md"), gameClaude(name));
  console.log("Created CLAUDE.md");
  await Deno.writeTextFile(join(targetDir, ".gitignore"), gameGitignore());
  console.log("Created .gitignore");

  if (isLocal) {
    console.log(`
Test project "${name}" created with local engine linkage!

Imports resolve to: ${engineRelPath}/mod.ts

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
