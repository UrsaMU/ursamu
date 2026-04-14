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
  gameConnectTxt,
  gameWikiHome,
  gameGitignore,
  gameReadme,
} from "./create-templates.ts";

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

  if (!isLocal) {
    await Deno.writeTextFile(
      join(targetDir, "src", "plugins", "plugins.manifest.json"),
      JSON.stringify(DEFAULT_PLUGINS_MANIFEST, null, 2),
    );
    console.log("Created src/plugins/plugins.manifest.json");
  }

  await Deno.writeTextFile(join(targetDir, "wiki", "home.md"), gameWikiHome(name));
  console.log("Created wiki/home.md");

  if (!isLocal) await copySystemScripts(targetDir);

  await Deno.writeTextFile(join(targetDir, "src", "main.ts"),   gameMainTs(name));
  console.log("Created src/main.ts");
  await Deno.writeTextFile(join(targetDir, "src", "telnet.ts"), gameTelnetTs());
  console.log("Created src/telnet.ts");
  await Deno.writeTextFile(join(targetDir, "scripts", "run.sh"), gameRunSh(name));
  console.log("Created scripts/run.sh");
  try {
    await Deno.chmod(join(targetDir, "scripts", "run.sh"), 0o755);
  } catch { /* non-fatal on some platforms */ }

  await Deno.writeTextFile(join(targetDir, "text", "default_connect.txt"), gameConnectTxt(name));
  console.log("Created text/default_connect.txt");

  const denoJson = isLocal
    ? JSON.stringify({
        tasks: {
          "start":  "bash ./scripts/run.sh",
          "server": "deno run -A --watch --unstable-detect-cjs --unstable-kv --unstable-net ./src/main.ts",
          "telnet": "deno run -A --unstable-detect-cjs --unstable-kv --unstable-net ./src/telnet.ts",
          "test":   "deno test --allow-all --unstable-kv --no-check",
        },
        imports: {
          "ursamu":         `${engineRelPath}/mod.ts`,
          "ursamu/":        `${engineRelPath}/`,
          "@ursamu/ursamu": `${engineRelPath}/mod.ts`,
          "@std/path":      "jsr:@std/path@^0.224.0",
          "@std/assert":    "jsr:@std/assert@^0.224.0",
          "@std/fs":        "jsr:@std/fs@^0.224.0",
        },
      }, null, 2)
    : `{
  "nodeModulesDir": "auto",
  "tasks": ${JSON.stringify(GAME_PROJECT_TASKS, null, 2).replace(/\n/g, "\n  ")},
  "compilerOptions": {
    "lib": ["deno.window"],
    "types": ["./node_modules/@types/node/index.d.ts"]
  },
  "imports": {
    "ursamu": "jsr:@ursamu/ursamu",
    "@ursamu/ursamu": "jsr:@ursamu/ursamu",
    "@std/path": "jsr:@std/path@^0.224.0",
    "@std/assert": "jsr:@std/assert@^0.224.0",
    "@std/fs": "jsr:@std/fs@^0.224.0"
  }
}`;

  await Deno.writeTextFile(join(targetDir, "deno.json"), denoJson);
  console.log("Created deno.json");

  await Deno.writeTextFile(join(targetDir, "README.md"), gameReadme(name));
  console.log("Created README.md");
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
