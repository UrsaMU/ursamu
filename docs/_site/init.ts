#!/usr/bin/env -S deno run -A

import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";

/**
 * UrsaMU Setup Wizard
 * This script is designed to be run remotely via a single one-liner:
 * deno run -A -r https://raw.githubusercontent.com/ursamu/ursamu/main/src/cli/init.ts
 */

const getRes = (text: string, defaultValue?: string) => {
  const promptText = defaultValue ? `${text} [${defaultValue}]: ` : `${text}: `;
  const val = prompt(promptText);
  if (val === null || val.trim() === "") return defaultValue || "";
  return val.trim();
};

console.log(`
%ch%cc==================================================%cn
%ch%cw        Welcome to the %cyUrsaMU%cw Setup Wizard%cn
%ch%cc==================================================%cn
%cw
This wizard will help you bootstrap your new MU* game in seconds.
%cn`);

// 1. Project Information
const projectName = getRes("Project Name", "my-ursamu-game");
const targetDir = join(Deno.cwd(), projectName);

if (existsSync(targetDir)) {
  console.error(`\n%crError: Directory already exists at ${targetDir}.%cn`);
  Deno.exit(1);
}

// 2. Configuration Defaults
console.log("\n%ch%cy--- Network Configuration ---%cn");
const telnetPort = getRes("Telnet Port", "4201");
const httpPort = getRes("Web API/WS Port", "4203");

console.log("\n%ch%cy--- Game Details ---%cn");
const gameName = getRes("Game Name", projectName);
const gameDesc = getRes("Game Description", "A modern MU* game.");

console.log(`\n%ch%cgPreparing to create project in: %cy${targetDir}%cn`);

// 3. Create Structure
try {
  Deno.mkdirSync(targetDir);
  const dirs = ["config", "data", "src", "src/plugins", "text", "help", "scripts"];
  for (const dir of dirs) {
    Deno.mkdirSync(join(targetDir, dir), { recursive: true });
  }

  // 4. Scaffold Files
  
  // main.ts
  const mainTs = `import { mu } from "ursamu";

const config = {
  server: {
    telnet: ${telnetPort},
    ws: 4202,
    http: ${httpPort},
    db: "data/ursamu.db",
    counters: "counters",
    chans: "chans",
    mail: "mail",
    bboard: "bboard"
  },
  game: {
    name: "${gameName}",
    description: "${gameDesc}",
    version: "0.0.1",
    text: {
      connect: "text/default_connect.txt"
    },
    playerStart: "1"
  }
};

const game = await mu(config);
console.log(\`\${game.config.get("game.name")} is live!\`);
`;

  // deno.json
  const denoJson = `{
  "tasks": {
    "start": "bash ./scripts/run.sh",
    "server": "deno run -A --watch --unstable-detect-cjs --unstable-kv ./src/main.ts",
    "telnet": "deno run -A --watch --unstable-detect-cjs --unstable-kv ./src/telnet.ts"
  },
  "imports": {
    "ursamu": "npm:ursamu"
  }
}`;

  // connect text
  const connectText = `%ch%cc==================================%cn
%ch%cw Welcome to %cy${gameName}%cn
%ch%cc==================================%cn

A modern MUSH-like engine written in TypeScript.

%ch%cwType %cy'connect <n> <password>'%cw to connect.%cn
%ch%cwType %cy'create <n> <password>'%cw to create a new character.%cn
%ch%cwType %cy'quit'%cw to disconnect.%cn

888     888 8888888b.   .d8888b.        d8888 888b     d888 888     888 
888     888 888   Y88b d88P  Y88b      d88888 8888b   d8888 888     888 
888     888 888    888 Y88b.          d88P888 88888b.d88888 888     888 
888     888 888   d88P  "Y888b.      d88P 888 888Y88888P888 888     888 
888     888 8888888P"      "Y88b.   d88P  888 888 Y888P 888 888     888 
888     888 888 T88b         "888  d88P   888 888  Y8P  888 888     888 
Y88b. .d88P 888  T88b  Y88b  d88P d8888888888 888   "   888 Y88b. .d88P 
 "Y88888P"  888   T88b  "Y8888P" d88P     888 888       888  "Y88888P"  

>> Powered by UrsaMU. https://github.com/ursamu/ursamu
`;

  Deno.writeTextFileSync(join(targetDir, "src", "main.ts"), mainTs);
  Deno.writeTextFileSync(join(targetDir, "deno.json"), denoJson);
  Deno.writeTextFileSync(join(targetDir, "text", "default_connect.txt"), connectText);

  // telnet.ts
  Deno.writeTextFileSync(join(targetDir, "src", "telnet.ts"), 
    `import { startTelnetServer } from "ursamu";\nstartTelnetServer({ welcomeFile: "text/default_connect.txt" });`);

  // run.sh (simplified for portable init)
  const runSh = `#!/bin/bash
cleanup() { kill $MAIN_PID $TELNET_PID 2>/dev/null; exit 0; }
trap cleanup SIGINT SIGTERM
deno run -A --unstable-kv --watch src/main.ts & MAIN_PID=$!
deno run -A --unstable-kv --watch src/telnet.ts & TELNET_PID=$!
wait $MAIN_PID $TELNET_PID`;
  Deno.writeTextFileSync(join(targetDir, "scripts", "run.sh"), runSh);
  Deno.chmodSync(join(targetDir, "scripts", "run.sh"), 0o755);

  console.log(`\n%ch%cg✨ Success! Project created in ${projectName}.%cn`);
  console.log(`\nTo start your game:`);
  console.log(`  %cycd ${projectName}%cn`);
  console.log(`  %cydeno task start%cn\n`);

} catch (err) {
  console.error(`\n%crFatal Error during setup:%cn`, err);
  Deno.exit(1);
}
