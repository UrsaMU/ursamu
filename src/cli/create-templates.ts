/**
 * @module cli/create-templates
 *
 * Pure template string functions for the `ursamu create` scaffolding CLI.
 * All functions accept parameters and return file content ready to write to disk.
 */

// ─── standalone plugin templates ──────────────────────────────────────────────

export function standalonePluginIndexTs(
  name: string,
  version: string,
  desc: string,
  varName: string,
): string {
  return `import type { IPlugin } from "ursamu/types";

const ${varName}Plugin: IPlugin = {
  name: "${name}",
  version: "${version}",
  description: "${desc}",

  init: async () => {
    console.log("[${name}] Plugin initialized");
    return true;
  },

  remove: async () => {
    console.log("[${name}] Plugin removed");
  },
};

export default ${varName}Plugin;
`;
}

export function standalonePluginTestTs(name: string, version: string): string {
  return `import { assertEquals } from "@std/assert";
import plugin from "../index.ts";

Deno.test("${name} — metadata", () => {
  assertEquals(plugin.name, "${name}");
  assertEquals(plugin.version, "${version}");
});

Deno.test("${name} — init returns true", async () => {
  const result = await plugin.init?.();
  assertEquals(result, true);
});
`;
}

// ─── in-tree plugin templates ──────────────────────────────────────────────────

export function inTreePluginDbTs(name: string, title: string): string {
  const dbVar = name.replace(/-/g, "_");
  return `import { DBO } from "ursamu/database";

// ─── types ────────────────────────────────────────────────────────────────────

export interface I${title}Record {
  id: string;
  // TODO: add your fields here
  createdAt: number;
}

// ─── database ─────────────────────────────────────────────────────────────────

export const ${dbVar}Db = new DBO<I${title}Record>("server.${name}");
`;
}

export function inTreePluginCommandsTs(name: string): string {
  const escapedName = name.replace(/-/g, "\\-");
  return `import { addCmd } from "ursamu/commands";
import type { IUrsamuSDK } from "ursamu/types";

// ─── +${name} ─────────────────────────────────────────────────────────────────
//
// Usage: +${name} [args]
//
// TODO: rename the command and implement your logic.

addCmd({
  name: "+${name}",
  pattern: /^\\+${escapedName}(?:\\/(\\S+))?\\s*(.*)/i,
  lock: "connected",
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
    const arg = (u.cmd.args[1] || "").trim();

    void sw; void arg; // remove once you use them

    u.send("Hello from the ${name} plugin!");
  },
});
`;
}

export function inTreePluginRouterTs(name: string, handlerName: string): string {
  return `// REST route handler for the ${name} plugin.
// Registered under prefix "/api/v1/${name}" in index.ts.

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function ${handlerName}(
  req: Request,
  userId: string | null
): Promise<Response> {
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  // GET /api/v1/${name}
  if (path === "/api/v1/${name}" && method === "GET") {
    return jsonResponse({ plugin: "${name}", ok: true });
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
`;
}

export function inTreePluginIndexTs(
  name: string,
  handlerName: string,
  varName: string,
): string {
  return `import type { IPlugin } from "ursamu/types";
import { registerPluginRoute } from "ursamu/app";
import { ${handlerName} } from "./router.ts";
import "./commands.ts";

const ${varName}Plugin: IPlugin = {
  name: "${name}",
  version: "1.0.0",
  description: "TODO: describe your plugin",

  init: async () => {
    registerPluginRoute("/api/v1/${name}", ${handlerName});
    console.log("[${name}] Plugin initialized");
    return true;
  },

  remove: async () => {
    console.log("[${name}] Plugin removed");
  },
};

export default ${varName}Plugin;
`;
}

// ─── game project templates ────────────────────────────────────────────────────

export function gameMainTs(name: string): string {
  return `import { mu } from "ursamu";

const config = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "data/ursamu.db",
    counters: "counters",
    chans: "chans",
    mail: "mail",
    bboard: "bboard",
  },
  game: {
    name: "${name}",
    description: "A custom UrsaMU game",
    version: "0.0.1",
    text: { connect: "text/default_connect.txt" },
    playerStart: "1",
  },
};

const game = await mu(config);

console.log(\`\${game.config.get("game.name")} main server is running!\`);
`;
}

export function gameTelnetTs(): string {
  return `import { startTelnetServer } from "ursamu";

startTelnetServer({ welcomeFile: "text/default_connect.txt" });

console.log("Telnet server is running!");
`;
}

export function gameRunSh(name: string): string {
  return `#!/bin/bash
# Run script for ${name}

cd "\$(dirname "\$0")/.." || exit

# Free bound ports (4201 telnet, 4202 ws, 4203 http)
for port in 4201 4202 4203; do
  pids=\$(lsof -ti ":\$port" 2>/dev/null)
  if [ -n "\$pids" ]; then
    echo "Freeing port \$port (PIDs: \$pids)..."
    echo "\$pids" | xargs kill -9 2>/dev/null
  fi
done

cleanup() {
  echo "Shutting down servers..."
  kill \$MAIN_PID \$TELNET_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "Starting main server in watch mode..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --unstable-net --watch src/main.ts &
MAIN_PID=\$!

echo "Starting telnet server..."
deno run --allow-all --unstable-detect-cjs --unstable-kv --unstable-net src/telnet.ts &
TELNET_PID=\$!

echo "Servers are running. Press Ctrl+C to stop."
wait \$MAIN_PID \$TELNET_PID
cleanup
`;
}

export function gameConnectTxt(name: string): string {
  return `%ch%cc==================================%cn
%ch%cw Welcome to %cy${name}%cn
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
}

export function gameWikiHome(name: string): string {
  return `# ${name} Wiki

Welcome to the ${name} wiki. Use this directory to document your game world, lore, rules, and staff notes.

## Getting Started

- [Lore & Setting](lore.md) — world background and theme
- [Rules](rules.md) — game rules and policies
- [Staff Notes](staff.md) — internal notes for staff

## Tips

- Add new \`.md\` files to this directory for each topic.
- Link between pages using relative paths, e.g. \`[Rules](rules.md)\`.
`;
}

export function gameGitignore(): string {
  return `.deno/
.vscode/.deno/
.env
data/*.db
config/config.json
node_modules/
`;
}

export function gameReadme(name: string): string {
  return `# ${name}

A modern MU* game built with the [UrsaMU](https://github.com/ursamu/ursamu) engine.

## Architecture

- **Main Server** (\`src/main.ts\`) — game engine, database, WebSocket, HTTP API
- **Telnet Server** (\`src/telnet.ts\`) — classic MU* connections, runs as a separate process

### Ports

| Protocol | Port |
|----------|------|
| Telnet   | 4201 |
| WebSocket | 4202 |
| HTTP API | 4203 |

## Getting Started

\`\`\`bash
deno task start
\`\`\`

This starts both servers with watch mode enabled.

## Connecting

- Telnet: \`telnet localhost 4201\`
- WebSocket: \`ws://localhost:4202\`
- HTTP API: \`http://localhost:4203/api/...\`

## Project Structure

\`\`\`
${name}/
├── config/             Configuration files
├── data/               Database files
├── help/               In-game help files
├── scripts/            Utility scripts (run.sh, etc.)
├── src/
│   ├── main.ts         Main server entry point
│   ├── telnet.ts       Telnet server entry point
│   └── plugins/        Custom plugins
├── system/scripts/     Engine system scripts (editable)
├── text/
│   └── default_connect.txt  Welcome screen
├── wiki/               Game wiki and documentation
└── deno.json           Tasks and import map
\`\`\`

## Extending

Add plugins to \`src/plugins/\`:

\`\`\`bash
deno run -A jsr:@ursamu/ursamu/cli create plugin my-feature
\`\`\`

## Documentation

- [UrsaMU Docs](https://ursamu.github.io/ursamu/)
- [GitHub](https://github.com/ursamu/ursamu)

## License

MIT
`;
}
