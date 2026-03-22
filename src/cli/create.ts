#!/usr/bin/env -S deno run -A

import { parse } from "jsr:@std/flags@^0.224.0";
import { join, dirname, fromFileUrl } from "jsr:@std/path@^0.224.0";
import { existsSync } from "jsr:@std/fs@^0.224.0";
import { GAME_PROJECT_TASKS } from "./game-project-tasks.ts";

// Get the directory of the current script (safe for both file:// and JSR https:// URLs)
const __dirname = import.meta.url.startsWith("file://")
  ? dirname(fromFileUrl(import.meta.url))
  : Deno.cwd();
// Working directory — used by both the plugin scaffold and project creation paths
const currentDir = Deno.cwd();

// Parse command line arguments
const args = parse(Deno.args, {
  boolean: ["help", "standalone", "non-interactive"],
  string: ["name", "telnet-port", "http-port", "game-name", "game-desc"],
  alias: {
    h: "help",
  },
});

// Show help
if (args.help || args._.length === 0) {
  console.log(`
UrsaMU Project Creator

Usage:
  ursamu create <project-name>          Create a new game project
  ursamu create plugin <plugin-name>    Scaffold a new plugin

Options:
  -h, --help          Show this help message

Examples:
  ursamu create my-game
  ursamu create plugin my-feature
  `);
  Deno.exit(0);
}

// ── plugin scaffold ───────────────────────────────────────────────────────────
if (args._[0]?.toString() === "plugin") {
  let pluginName = args._[1]?.toString() ?? args["name"] ?? "";

  if (!pluginName) {
    if (args["non-interactive"]) {
      console.error("Error: plugin name is required.\nUsage: ursamu create plugin <plugin-name>");
      Deno.exit(1);
    }
    pluginName = prompt("Plugin name: ")?.trim() ?? "";
    if (!pluginName) {
      console.error("Aborted — no name provided.");
      Deno.exit(1);
    }
  }

  // ── standalone plugin project (publishable repo) ──────────────────────────
  if (args["standalone"]) {
    const pluginDesc    = args["game-desc"] ?? (args["non-interactive"] ? `A UrsaMU plugin` : prompt(`Description [A UrsaMU plugin]: `)?.trim() || "A UrsaMU plugin");
    const pluginVersion = args["telnet-port"] ?? (args["non-interactive"] ? "1.0.0" : prompt(`Version [1.0.0]: `)?.trim() || "1.0.0");
    const pluginAuthor  = args["non-interactive"] ? "" : prompt(`Author []: `)?.trim() ?? "";

    const targetDir = join(currentDir, pluginName);
    if (existsSync(targetDir)) {
      console.error(`Error: Directory already exists at ${targetDir}`);
      Deno.exit(1);
    }

    console.log(`Initializing standalone UrsaMU plugin: ${pluginName}`);
    await Deno.mkdir(join(targetDir, "tests"), { recursive: true });

    // ursamu.plugin.json
    await Deno.writeTextFile(join(targetDir, "ursamu.plugin.json"), JSON.stringify({
      name:        pluginName,
      version:     pluginVersion,
      description: pluginDesc,
      ursamu:      ">=1.0.0",
      author:      pluginAuthor,
      license:     "MIT",
      main:        "index.ts",
    }, null, 2));
    console.log("  Created ursamu.plugin.json");

    // deno.json
    await Deno.writeTextFile(join(targetDir, "deno.json"), JSON.stringify({
      tasks: { test: "deno test -A --unstable-kv" },
      imports: { "ursamu": "jsr:@ursamu/ursamu" },
    }, null, 2));
    console.log("  Created deno.json");

    // index.ts
    const pluginVar = pluginName.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
    await Deno.writeTextFile(join(targetDir, "index.ts"), `import type { IPlugin } from "ursamu/types";

const ${pluginVar}Plugin: IPlugin = {
  name: "${pluginName}",
  version: "${pluginVersion}",
  description: "${pluginDesc}",

  init: async () => {
    console.log("[${pluginName}] Plugin initialized");
    return true;
  },

  remove: async () => {
    console.log("[${pluginName}] Plugin removed");
  },
};

export default ${pluginVar}Plugin;
`);
    console.log("  Created index.ts");

    // tests/plugin.test.ts
    await Deno.writeTextFile(join(targetDir, "tests", "plugin.test.ts"), `import { assertEquals } from "@std/assert";
import plugin from "../index.ts";

Deno.test("${pluginName} — metadata", () => {
  assertEquals(plugin.name, "${pluginName}");
  assertEquals(plugin.version, "${pluginVersion}");
});

Deno.test("${pluginName} — init returns true", async () => {
  const result = await plugin.init?.();
  assertEquals(result, true);
});
`);
    console.log("  Created tests/plugin.test.ts");

    // .gitignore
    await Deno.writeTextFile(join(targetDir, ".gitignore"), `.deno/\nnode_modules/\n`);
    console.log("  Created .gitignore");

    console.log(`
Standalone plugin "${pluginName}" created at ./${pluginName}/

  cd ${pluginName}
  deno task test

Ship ursamu.plugin.json at the repo root so users can install via:
  ursamu plugin install https://github.com/you/${pluginName}
`);
    Deno.exit(0);
  }

  // ── in-tree plugin scaffold (inside src/plugins/) ─────────────────────────
  const pluginsDir  = join(currentDir, "src", "plugins");
  const pluginDir   = join(pluginsDir, pluginName);
  const pluginTitle = pluginName.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  if (existsSync(pluginDir)) {
    console.error(`Error: Plugin directory already exists at ${pluginDir}`);
    Deno.exit(1);
  }

  if (!existsSync(pluginsDir)) {
    await Deno.mkdir(pluginsDir, { recursive: true });
  }

  await Deno.mkdir(pluginDir);
  console.log(`Creating plugin: ${pluginName}`);

  // db.ts
  await Deno.writeTextFile(join(pluginDir, "db.ts"), `import { DBO } from "ursamu/database";

// ─── types ────────────────────────────────────────────────────────────────────

export interface I${pluginTitle.replace(/\s/g, "")}Record {
  id: string;
  // TODO: add your fields here
  createdAt: number;
}

// ─── database ────────────────────────────────────────────────────────────────

export const ${pluginName.replace(/-/g, "_")}Db = new DBO<I${pluginTitle.replace(/\s/g, "")}Record>("server.${pluginName}");
`);
  console.log("  Created db.ts");

  // commands.ts
  await Deno.writeTextFile(join(pluginDir, "commands.ts"), `import { addCmd } from "ursamu/commands";
import type { IUrsamuSDK } from "ursamu/types";

// ─── /${pluginName} ──────────────────────────────────────────────────────────
//
// Usage: +${pluginName} [args]
//
// TODO: rename the command and implement your logic.

addCmd({
  name: "+${pluginName}",
  pattern: /^\\+${pluginName.replace(/-/g, "\\-")}(?:\\/(\\S+))?\\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    void sw; void arg; // remove once you use them

    u.send("Hello from the ${pluginName} plugin!");
  },
});
`);
  console.log("  Created commands.ts");

  // router.ts
  await Deno.writeTextFile(join(pluginDir, "router.ts"), `// REST route handler for the ${pluginName} plugin.
// Registered under prefix "/api/v1/${pluginName}" in index.ts.

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function ${pluginName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}RouteHandler(
  req: Request,
  userId: string | null
): Promise<Response> {
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  // GET /api/v1/${pluginName}
  if (path === "/api/v1/${pluginName}" && method === "GET") {
    return jsonResponse({ plugin: "${pluginName}", ok: true });
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
`);
  console.log("  Created router.ts");

  // index.ts
  const handlerName = `${pluginName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}RouteHandler`;
  await Deno.writeTextFile(join(pluginDir, "index.ts"), `import type { IPlugin } from "ursamu/types";
import { registerPluginRoute } from "ursamu/app";
import { ${handlerName} } from "./router.ts";
import "./commands.ts";

const ${pluginName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Plugin: IPlugin = {
  name: "${pluginName}",
  version: "1.0.0",
  description: "TODO: describe your plugin",

  init: async () => {
    registerPluginRoute("/api/v1/${pluginName}", ${handlerName});
    console.log("[${pluginName}] Plugin initialized");
    return true;
  },

  remove: async () => {
    console.log("[${pluginName}] Plugin removed");
  },
};

export default ${pluginName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Plugin;
`);
  console.log("  Created index.ts");

  console.log(`
Plugin '${pluginName}' scaffolded at src/plugins/${pluginName}/

Files created:
  index.ts      — plugin entry point (init, remove)
  commands.ts   — in-game +${pluginName} command (addCmd)
  router.ts     — REST handler for /api/v1/${pluginName}
  db.ts         — custom DBO database collection

The plugin is auto-discovered — no registration needed.
Restart the server and it will load automatically.
`);
  Deno.exit(0);
}

const projectName = args._[0].toString();
const targetDir = join(currentDir, projectName);

// Check if the project directory already exists
if (existsSync(targetDir)) {
  console.error(`Error: Directory already exists at ${targetDir}`);
  Deno.exit(1);
}

// Create the project directory
console.log(`Creating new UrsaMU project: ${projectName}`);
await Deno.mkdir(targetDir);

// Create the basic project structure
const directories = [
  "config",
  "data",
  "src",
  "src/plugins",
  "text",
  "help",
  "scripts",
  "system/scripts",
  "wiki",
];

for (const dir of directories) {
  await Deno.mkdir(join(targetDir, dir), { recursive: true });
  console.log(`Created directory: ${dir}`);
}

// Create starter wiki page
await Deno.writeTextFile(join(targetDir, "wiki", "home.md"), `# ${projectName} Wiki

Welcome to the ${projectName} wiki. Use this directory to document your game world, lore, rules, and staff notes.

## Getting Started

- [Lore & Setting](lore.md) — world background and theme
- [Rules](rules.md) — game rules and policies
- [Staff Notes](staff.md) — internal notes for staff

## Tips

- Add new \`.md\` files to this directory for each topic.
- Link between pages using relative paths, e.g. \`[Rules](rules.md)\`.
`);
console.log("Created wiki/home.md");

// Copy engine's system scripts into the new project so they are editable
{
  const SCRIPT_NAMES = [
    "admin","alias","chancreate","chandestroy","channels","chanset","clone","connect",
    "create","describe","destroy","dig","doing","drop","emit","examine","find","flags",
    "format","get","give","help","home","inventory","link","lock","look","mail","mailadd",
    "moniker","motd","name","open","page","parent","pemit","pose","quit","quota","remit",
    "say","score","search","set","setAttr","stats","teleport","think","trigger","unlink",
    "who","wipe",
    "tel","forceCmd","sweep","entrances",
  ];
  const engineScriptsBase = new URL("../../system/scripts/", import.meta.url);
  let copied = 0;
  for (const name of SCRIPT_NAMES) {
    const url = new URL(`${name}.ts`, engineScriptsBase);
    try {
      let content: string;
      if (url.protocol === "file:") {
        content = await Deno.readTextFile(fromFileUrl(url));
      } else {
        const res = await fetch(url.toString());
        if (!res.ok) continue;
        content = await res.text();
      }
      await Deno.writeTextFile(join(targetDir, "system", "scripts", `${name}.ts`), content);
      copied++;
    } catch { /* skip missing */ }
  }
  console.log(`Created system/scripts/ (${copied} scripts)`);
}

// Create the main.ts file
const mainTsContent = `import { mu } from "ursamu";

// Initialize the UrsaMU engine with custom configuration
const config = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "data/ursamu.db",
    counters: "counters",
    chans: "chans",
    mail: "mail",
    bboard: "bboard"
  },
  game: {
    name: "${projectName}",
    description: "A custom UrsaMU game",
    version: "0.0.1",
    text: {
      connect: "text/default_connect.txt"
    },
    playerStart: "1"
  }
};

// Start the game engine
const game = await mu(config);

console.log(\`\${game.config.get("game.name")} main server is running!\`);
`;

await Deno.writeTextFile(join(targetDir, "src", "main.ts"), mainTsContent);
console.log("Created src/main.ts");

// Create the telnet.ts file
const telnetTsContent = `import { startTelnetServer } from "ursamu";

// Start the telnet server with the correct welcome file path
startTelnetServer({
  welcomeFile: "text/default_connect.txt"
});

console.log("Telnet server is running!");
`;

await Deno.writeTextFile(join(targetDir, "src", "telnet.ts"), telnetTsContent);
console.log("Created src/telnet.ts");

// Create the run.sh script
const runShContent = `#!/bin/bash

# Run script for ${projectName}
# This script runs both the main server and telnet server with the necessary flags
# With watch mode enabled for automatic reloading on file changes

# Change to the project root directory
cd "\$(dirname "\$0")/.." || exit

# Function to handle cleanup when the script is terminated
cleanup() {
  echo "Shutting down servers..."
  kill \$MAIN_PID \$TELNET_PID 2>/dev/null
  exit 0
}

# Set up trap to catch termination signals
trap cleanup SIGINT SIGTERM

# Run the main server with watch mode
echo "Starting main server in watch mode..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --watch src/main.ts &
MAIN_PID=\$!

# Telnet runs without --watch so it stays up across code reloads.
echo "Starting telnet server..."
deno run --allow-all --unstable-detect-cjs --unstable-kv src/telnet.ts &
TELNET_PID=\$!

# Wait for both processes
echo "Servers are running in watch mode. Press Ctrl+C to stop."
echo "Servers will automatically restart when files are changed."
echo "Main server and telnet server can restart independently."
wait \$MAIN_PID \$TELNET_PID

# If we get here, one of the servers has exited
echo "One of the servers has exited. Shutting down..."
cleanup
`;

await Deno.writeTextFile(join(targetDir, "scripts", "run.sh"), runShContent);
console.log("Created scripts/run.sh");

// Make the run.sh script executable
try {
  await Deno.chmod(join(targetDir, "scripts", "run.sh"), 0o755);
  console.log("Made scripts/run.sh executable");
} catch {
  console.warn("Warning: Could not make scripts/run.sh executable. You may need to do this manually.");
}

// Create the default_connect.txt file with the complete content
const connectTextContent = `%ch%cc==================================%cn
%ch%cw Welcome to %cy${projectName}%cn
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

>> A Next Generation MU*. https://github.com/ursamu/ursamu

Use 'create <name> <password>' to create a new character. 
Use 'connect <name> <password>' to connect to the game.

Use 'QUIT' to exit.`;

await Deno.writeTextFile(join(targetDir, "text", "default_connect.txt"), connectTextContent);
console.log("Created text/default_connect.txt with complete content");

// Create a deno.json file
const denoJsonContent = `{
  "nodeModulesDir": "auto",
  "tasks": ${JSON.stringify(GAME_PROJECT_TASKS, null, 2).replace(/\n/g, "\n  ")},
  "compilerOptions": {
    "lib": ["deno.window"],
    "types": ["./node_modules/@types/node/index.d.ts"]
  },
  "imports": {
    "ursamu": "jsr:@ursamu/ursamu"
  }
}`;

await Deno.writeTextFile(join(targetDir, "deno.json"), denoJsonContent);
console.log("Created deno.json");

// Create a README.md file
const readmeContent = `# ${projectName}

A modern MU* game built with the UrsaMU engine - a next-generation MUSH-like platform written in TypeScript.

<p align="center">
  <img src="https://raw.githubusercontent.com/ursamu/ursamu/main/ursamu_github_banner.png" alt="${projectName} Banner" width="600">
</p>

## 🏗️ Architecture

${projectName} uses a microservices architecture with independent processes:

### Core Services

- **Main Server** (src/main.ts)
  - Game engine and core logic
  - Database operations
  - Web API endpoints
  - WebSocket connections
  - Plugin management

- **Telnet Server** (src/telnet.ts)
  - Dedicated telnet connection handling
  - Runs as a separate process
  - Can restart independently

### Database Services

Multiple KV databases for different game aspects:
- Main database (data/ursamu.db)
- Counters (data/counters.db)
- Channels (data/chans.db)
- Mail system (data/mail.db)
- Bulletin boards (data/bboard.db)

### Network Services

- **Telnet**: Port 4201 - Classic MU* connection
- **WebSocket**: Port 4202 - WebSocket connections
- **HTTP API**: Port 4203 - RESTful API

## 🚀 Getting Started

### Quick Start

To launch all services with automatic reload:

\`\`\`bash
deno task start
# or
bash ./scripts/run.sh
\`\`\`

This will:
- Start all services as independent processes
- Enable watch mode for automatic reloading
- Allow each service to restart independently when its files change

### Development Mode

For targeted development:

\`\`\`bash
# Main server only with watch mode
deno task server

# Telnet server only with watch mode
deno task telnet
\`\`\`

## 🔌 Connecting

Connect to your game using:
- **Telnet Client**: \`telnet localhost 4201\`
- **WebSocket**: Connect to \`ws://localhost:4202\` from custom clients
- **HTTP API**: \`http://localhost:4203/api/...\`

## 📁 Project Structure

\`\`\`
${projectName}/
├── config/             # Configuration files
├── data/               # Database files
├── help/               # Help files for in-game help system
├── scripts/            # Utility scripts
│   └── run.sh          # Main script to run all services
├── src/                # Source code
│   ├── main.ts         # Main server entry point
│   ├── telnet.ts       # Telnet server entry point
│   └── plugins/        # Custom plugins
├── text/               # Text files
│   └── default_connect.txt  # Welcome screen
├── wiki/               # Game wiki and documentation
│   └── home.md         # Wiki home page
├── deno.json           # Deno configuration and tasks
└── README.md           # This file
\`\`\`

## ⚙️ Configuration

The game configuration is stored in \`config/config.json\` and includes:

- Server ports and database paths
- Game name, description, and version
- Text file locations
- Plugin settings

## 🧩 Extending Functionality

### Plugins

Create custom plugins in the \`src/plugins\` directory to extend functionality:
- Commands
- Systems
- Features
- Integrations

### Customizing Text

Edit files in the \`text/\` directory to customize player-facing content:
- \`default_connect.txt\`: The welcome screen shown to connecting players

## 📚 Documentation

For more information about UrsaMU:
- [UrsaMU Documentation](https://ursamu.github.io/ursamu/)
- [UrsaMU GitHub](https://github.com/ursamu/ursamu)

## 📝 License

This project is based on UrsaMU, which is licensed under the MIT License.
`;

await Deno.writeTextFile(join(targetDir, "README.md"), readmeContent);
console.log("Created README.md");

// Create a .gitignore file
const gitignoreContent = `# Deno
.deno/
.vscode/.deno/

# Environment
.env

# Database files
data/*.db

# Configuration
config/config.json

# Node modules
node_modules/
`;

await Deno.writeTextFile(join(targetDir, ".gitignore"), gitignoreContent);
console.log("Created .gitignore");

console.log(`
Project ${projectName} created successfully!

To get started:
  cd ${projectName}
  deno task start

This will start your UrsaMU game with both main and telnet servers in watch mode.
The servers will automatically restart when files are changed.
Connect to the game using:
  - Telnet: localhost:4201
  - WebSocket: localhost:4202
  - HTTP: localhost:4203
`); 