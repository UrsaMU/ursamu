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

export function inTreePluginSchemasTs(name: string, title: string): string {
  return `// Type definitions for ${name} plugin DBO collections.
// DBO instances are created in the command files that own each collection — not here.
// Naming rule: every collection name must be prefixed "${name}."

// ─── standalone records ───────────────────────────────────────────────────────

export interface I${title}Record {
  id: string;        // crypto.randomUUID()
  playerId: string;
  createdAt: number; // Date.now()
  // TODO: add your fields here
}

// ─── player-inline state ──────────────────────────────────────────────────────
// Stored on the player object under state.${name}.
//
// Reading:
//   const ps = (u.me.state.${name} ?? {}) as I${title}PlayerState;
//
// Writing (always spread to preserve other fields):
//   await u.db.modify(u.me.id, "$set", { "state.${name}": { ...ps, field: value } });

export interface I${title}PlayerState {
  // TODO: add per-player state fields here
}
`;
}

// commands.ts barrel — one import per command family, no logic here.
export function inTreePluginCommandsTs(name: string): string {
  return `// Barrel: register all command families here (module-load phase).
// Each imported file calls addCmd() as a side effect — never inside init().
import "./commands/${name}.ts";
`;
}

// The actual command family file that lives in commands/<name>.ts.
export function inTreeCommandFamilyTs(name: string, title: string): string {
  const escapedName = name.replace(/-/g, "\\-");
  return `import { addCmd } from "ursamu/commands";
import type { IUrsamuSDK } from "ursamu/types";
// Uncomment to use standalone records in this family:
// import { DBO } from "ursamu/database";
// import type { I${title}Record } from "../db/schemas.ts";
// const records = new DBO<I${title}Record>("${name}.records");

// ─── +${name} ─────────────────────────────────────────────────────────────────

addCmd({
  name: "+${name}",
  pattern: /^\\+${escapedName}(?:\\/(\\S+))?\\s*(.*)/i,
  lock: "connected",
  category: "General",
  help: \`+${name}[/<switch>] [<arg>]  — TODO: describe this command.

Examples:
  +${name}          Does the thing.
  +${name} hello    Does the thing with an argument.\`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim(); // strip codes FIRST

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
import { registerPluginRoute, registerHelpDir } from "ursamu/app";
import { ${handlerName} } from "./router.ts";
import "./commands.ts"; // Phase 1 — addCmd() fires here via module-load side effects

// Named handlers — required so remove() can call .off() with the same reference.
// const onLogin = (e: SessionEvent) => { /* ... */ };

const ${varName}Plugin: IPlugin = {
  name: "${name}",
  version: "1.0.0",
  description: "TODO: describe your plugin",

  init: () => {
    registerPluginRoute("/api/v1/${name}", ${handlerName});
    registerHelpDir(new URL("./help", import.meta.url).pathname, "${name}");
    // gameHooks.on("player:login", onLogin);
    return true;
  },

  remove: () => {
    // gameHooks.off("player:login", onLogin); // one .off() per .on() above
  },
};

export default ${varName}Plugin;
`;
}

export function inTreeHelpMd(name: string): string {
  return `+${name.toUpperCase()}

TODO: one-sentence description of what this command does.

SYNTAX
  +${name}[/<switch>] [<arg>]

SWITCHES
  /switch    TODO: describe this switch.

EXAMPLES
  +${name}          Does the thing.
  +${name} hello    Does the thing with an argument.

SEE ALSO: +help index
`;
}

export function inTreePluginTestTs(name: string): string {
  return `// Tests for the ${name} plugin.
// Required cases per command:
//   happy path · null target · permission denied · correct DB op · admin guard · stripSubs

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import type { IDBObj, IUrsamuSDK } from "ursamu/types";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "${name.substring(0,2)}_actor1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "${name.substring(0,2)}_room1",
    contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: IDBObj | null;
  canEditResult?: boolean;
} = {}) {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  return Object.assign({
    me: mockPlayer(opts.me ?? {}),
    here: { id: "${name.substring(0,2)}_room1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [], broadcast: () => {} },
    cmd: { name: "", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => opts.canEditResult ?? true,
    db: {
      modify: async (...a: unknown[]) => { dbCalls.push(a); },
      search: async () => [],
      create: async (d: unknown) => ({ ...(d as object), id: "99", flags: new Set(), contents: [] }),
      destroy: async () => {},
    },
    util: {
      target: async () => opts.targetResult ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls });
}

Deno.test("${name} — placeholder (replace with real tests)", OPTS, () => {
  const u = mockU();
  assertEquals(typeof u.send, "function");
  assertStringIncludes("hello world", "hello");
});
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

// ─── plugin CLAUDE.md template ────────────────────────────────────────────────

export function pluginClaude(name: string, standalone: boolean): string {
  const title = name
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());

  const imports = standalone
    ? `import { addCmd, DBO, gameHooks, registerPluginRoute } from "jsr:@ursamu/ursamu";
import type { IPlugin, IUrsamuSDK, IDBObj, SessionEvent } from "jsr:@ursamu/ursamu";`
    : `import { addCmd }              from "ursamu/commands";
import { DBO }                 from "ursamu/database";
import { gameHooks }           from "ursamu";
import { registerPluginRoute } from "ursamu/app";
import type { IPlugin, IUrsamuSDK, IDBObj, SessionEvent } from "ursamu/types";`;

  const structure = standalone
    ? `${name}/
├── index.ts               IPlugin — init(), remove(), imports commands.ts
├── commands.ts            addCmd() registrations (module-load, NOT inside init)
├── tests/plugin.test.ts   Deno unit tests
├── showcases/${name}.json demo steps  →  deno task showcase ${name}-basic
├── deno.json              tasks: test, showcase
└── ursamu.plugin.json     package manifest`
    : `src/plugins/${name}/
├── index.ts               IPlugin — init(), remove(), registerHelpDir, imports commands.ts
├── commands.ts            Barrel only — one import per family, NO logic
├── commands/
│   └── ${name}.ts         addCmd() registrations live here, not in commands.ts
├── router.ts              REST handler for /api/v1/${name}
├── db/
│   └── schemas.ts         Types only — DBO instances live in the command files that own them
├── help/
│   └── ${name}.md         In-game help text (served by help-plugin FileProvider)
├── tests/
│   └── plugin.test.ts     Deno unit tests
└── showcases/${name}.json demo steps  →  deno task showcase ${name}-basic`;

  const escapedName = name.replace(/-/g, "\\-");

  return `# ${name} — UrsaMU Plugin

## Setup (do this first)

\`\`\`bash
npx @lhi/ursamu-dev         # install the dev skill
ursamu-dev --install-hooks  # block commits that fail the audit
\`\`\`

Activate in Claude Code: \`/ursamu-dev\`

The skill enforces a six-stage pipeline (Design → Generate → Audit → Refine → Test → Docs)
and knows every import path, SDK method, lock level, and security pattern.
Use it for every feature — no exceptions.

---

## Commands

\`\`\`bash
deno task test                       # full suite — must stay green
deno lint                            # must be clean
deno task showcase --list            # list this plugin's showcases
deno task showcase ${name}-basic     # render the basic showcase
ursamu-audit --fix                   # auto-fix common violations
ursamu-audit --watch                 # live violation feedback on save
\`\`\`

---

## Structure

\`\`\`
${structure}
\`\`\`

---

## Import paths

\`\`\`typescript
${imports}
\`\`\`

---

## addCmd skeleton

\`\`\`typescript
addCmd({
  name: "+${name}",
  pattern: /^\\+${escapedName}(?:\\/(\\S+))?\\s*(.*)/i,  // args[0]=switch, args[1]=rest
  lock: "connected",
  category: "General",
  help: \`+${name}[/switch] <arg>  — Description.

Examples:
  +${name} foo    Does the thing.
  +${name} bar    Does the other thing.\`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();  // strip codes FIRST
  },
});
\`\`\`

---

## Plugin lifecycle (index.ts)

\`\`\`typescript
import "./commands.ts";  // Phase 1 — addCmd() fires here, NOT in init()

const onLogin = (e: SessionEvent) => { /* named ref — required for remove() */ };

export const plugin: IPlugin = {
  name: "${name}",
  version: "1.0.0",
  description: "One sentence.",
  init:   () => { gameHooks.on("player:login", onLogin); return true; },
  remove: () => { gameHooks.off("player:login", onLogin); },  // same ref
};
\`\`\`

Rules: \`addCmd()\` never inside \`init()\` · \`init()\` must return \`true\` · every \`.on()\` needs a matching \`.off()\` using the same named function.

---

## Key SDK calls

\`\`\`typescript
const target = await u.util.target(u.me, arg, true);  // true = global search
if (!target) { u.send("Not found."); return; }

if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

await u.db.modify(target.id, "$set",  { "data.field": value });
await u.db.modify(target.id, "$inc",  { "data.score": 1 });
await u.db.modify(target.id, "$unset",{ "data.tmp": "" });

u.send("Message.", target.id);  // optional second arg = recipient socket id
\`\`\`

---

## Lock expressions & lockfuncs

The \`lock:\` field on every \`addCmd\` is evaluated against the acting player before \`exec()\` runs.

**String-level locks (privilege):**

\`\`\`
""                  login screen (unauthenticated)
"connected"         any logged-in player
"connected builder+" builder flag or higher
"connected admin+"  admin flag or higher
"connected wizard"  wizard only
\`\`\`

**Lockfunc expressions** — callable functions combined with \`&&\`, \`||\`, \`!\`, \`()\`:

\`\`\`
"flag(wizard)"                    enactor has wizard flag
"attr(tribe, glasswaler)"         enactor.state.tribe === "glasswaler"
"attr(sphere)"                    enactor has own-property "sphere" in state
"type(player)"                    enactor has player type flag
"is(#5)"                          enactor.id === "5"
"holds(#12)"                      enactor's inventory contains #12
"perm(admin)"                     enactor passes admin privilege check
"attr(mortal) || !tribe(glasswaler)"  compound expression
\`\`\`

**Registering a custom lockfunc in your plugin:**

\`\`\`typescript
import { registerLockFunc } from "jsr:@ursamu/ursamu";

// Call in your plugin's module scope (alongside addCmd — NOT inside init())
registerLockFunc("tribe", (enactor, _target, args) =>
  String(enactor.state.tribe ?? "").toLowerCase() === args[0]?.toLowerCase()
);

// Now usable anywhere: lock: "connected && tribe(glasswaler)"
\`\`\`

Built-in names (\`flag\`, \`attr\`, \`type\`, \`is\`, \`holds\`, \`perm\`) are protected and cannot
be overwritten. Locks are fail-closed: unknown func → false, thrown error → false.
Max lock string: 4096 chars / 256 tokens.

---

## Showcase — executes real commands in-process

\`\`\`bash
deno task showcase               # interactive menu
deno task showcase ${name}-basic # run one showcase by key
deno task showcase --list        # list all available showcases
\`\`\`

The showcase runner in \`tools/showcase.ts\` is **not a documentation renderer** — it
imports \`commands.ts\`, matches \`cmd\` steps against the real registered commands, and
calls \`cmd.exec(u)\` against an in-memory mock SDK. The output you see is the actual
output from your handlers.

**How \`cmd\` steps execute:**
1. Runner calls \`import("../commands.ts")\` — your \`addCmd()\` calls fire.
2. Each step's \`cmd\` string is matched against the live \`cmds\` registry (same regex as the engine).
3. A mock SDK is built: \`send()\` collects messages, \`db.modify()\` writes to an in-memory store and mirrors updates back onto the player object immediately so subsequent commands see fresh state.
4. \`cmd.exec(u)\` is called. Output is rendered with MUSH→ANSI color conversion.

**\`reset\` clears the in-memory DBO store** between scenarios. Use it before each independent scenario so state from the previous one doesn't bleed in.

**Step types:**

\`\`\`json
{ "sub":    "Heading" }
{ "note":   "Narrative — not executed." }
{ "cmd":    "+${name} arg", "label": "optional comment", "as": "admin" }
{ "expect": "substring that must appear in the previous cmd's output" }
{ "reset":  true }
{ "emit":   "RP action text (display only — not executed)" }
\`\`\`

**Template vars** (\`vars\` object in the JSON root): \`{{player}}\`, \`{{anyKey}}\` — interpolated into every \`cmd\` and \`note\` string before execution.

**Writing good showcases:**
- Write showcases *before* finalizing command syntax — if a step is awkward to write, the command is awkward to use.
- Cover the full happy path of each user-facing flow, not just individual commands.
- Use \`reset\` between independent scenarios; share state within a single narrative flow.
- Add \`"as": "admin"\` on steps that test admin-only commands.

**Expanding the mock SDK:**
The \`buildMockSDK()\` function in \`tools/showcase.ts\` stubs \`util.target\`, \`canEdit\`, etc. with sensible defaults. If a command needs a specific target to resolve, add it to the \`target\` stub in that file. The store in \`buildMockDb()\` handles \`$set\`, \`$inc\`, and \`$unset\` with dot-path notation and mirrors changes onto the live player object.

---

## Player-inline state pattern

\`\`\`typescript
// Reading (always default)
const ps = (u.me.state.${name} ?? {}) as I${title}PlayerState;

// Writing (always spread to preserve other fields)
await u.db.modify(u.me.id, "$set", { "state.${name}": { ...ps, field: value } });
\`\`\`

Use \`state.${name}\` for per-player condition (chargen stage, HP, active status).
Use \`new DBO("${name}.collection")\` for records with their own lifecycle (markets, jobs, combat rounds).

---

## Test boilerplate

\`\`\`typescript
const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("happy path", OPTS, async () => { /* ... */ });
// Required: happy path · null target · perm denied · correct DB op ($set/$inc/$unset) · admin guard · stripSubs
\`\`\`

Write pure engine/ function tests first — they need no mocks and catch the most regressions.
Add a \`tests/security/\` directory for exploit→fix tests; one file per bug found.

---

## Audit checklist

- [ ] \`u.util.stripSubs()\` on all user strings before DB ops or length checks
- [ ] \`await u.canEdit()\` before modifying any object not owned by \`u.me\`
- [ ] DB writes use \`"$set"\` / \`"$inc"\` / \`"$unset"\` — never raw overwrite
- [ ] \`u.util.target()\` null-checked before use
- [ ] All \`%c*\` color codes closed with \`%cn\`
- [ ] \`gameHooks.on()\` in \`init()\` paired with matching \`gameHooks.off()\` in \`remove()\` (same ref)
- [ ] DBO collection prefixed: \`"${name}.<collection>"\`
- [ ] REST route returns 401 before any work when \`userId\` is null
- [ ] \`init()\` returns \`true\`
- [ ] Every \`addCmd\` has \`help:\` with syntax line + examples
- [ ] Custom lockfuncs use \`registerLockFunc\` — never overwrite built-in names (\`flag\`, \`attr\`, \`type\`, \`is\`, \`holds\`, \`perm\`)
- [ ] Every help file ≤ 22 content lines
- [ ] Every help file line ≤ 78 characters
- [ ] Multi-page topics linked with \`SEE ALSO:\`
- [ ] Sub-files open with a back-reference to the parent topic

---

## Help file format

Every \`help/<name>.md\` must follow this layout exactly (≤78-char width, ≤22 lines):

\`\`\`
+COMMAND-NAME

One-sentence description.

SYNTAX
  +command[/switch] <required> [<optional>]

SWITCHES
  /switch    What this switch does.

EXAMPLES
  +command foo       Does the thing.
  +command/switch x  Does the other thing.

SEE ALSO: +help related-topic
\`\`\`

Rules:
- Title is \`+COMMAND-NAME\` in ALL CAPS, flush left — no decorative border lines.
- Section labels (\`SYNTAX\`, \`SWITCHES\`, \`EXAMPLES\`, \`SEE ALSO\`) are ALL CAPS, flush left.
- Body text indented 2 spaces.
- Max line width: 78 characters. Max content lines: 22.
- Long topics → split into subdirectory: \`help/${name}/syntax.md\`, \`help/${name}/examples.md\`.
  The overview file must end with \`SEE ALSO:\`. Sub-files must start with a back-reference.

---

## Help file conventions (help-plugin FileProvider)

Help is served by [help-plugin](https://github.com/UrsaMU/help-plugin). The FileProvider
scans every registered \`help/\` directory and derives topics from filenames.

### Hidden files

Files whose basename starts with \`_\` are **hidden** — they are loaded and searchable, but
excluded from the \`+help index\` listing. Use this for internal reference material that
players shouldn't see in the table of contents:

\`\`\`
help/
├── widget.md          # visible in +help index
├── _widget-admin.md   # hidden — admins can still +help _widget-admin
└── widget/
    ├── syntax.md      # visible under "widget" section
    └── _internals.md  # hidden sub-file
\`\`\`

### index.md / README.md

A file named \`index.md\` (or \`readme.md\`) in a subdirectory becomes the **section overview**
— its slug is the parent directory name, not the filename:

\`\`\`
help/widget/index.md   →  +help widget  (same slug as the directory)
help/widget/syntax.md  →  +help widget/syntax
\`\`\`

Use \`index.md\` for the overview page of a multi-file topic.

### Wiring your plugin's help directory

Call \`registerHelpDir\` inside your plugin's \`init()\` so the FileProvider scans your folder:

\`\`\`typescript
import { registerHelpDir } from "jsr:@ursamu/help-plugin";

export const plugin: IPlugin = {
  init: async () => {
    registerHelpDir(
      new URL("../help", import.meta.url).pathname,
      "${name}",  // section name shown in +help index
    );
    return true;
  },
};
\`\`\`

For full games (not standalone plugins) install help-plugin from
[github.com/UrsaMU/help-plugin](https://github.com/UrsaMU/help-plugin) and add it to
\`plugins.manifest.json\`.

---

## Full API reference

\`~/.claude/skills/ursamu-dev/references/api-reference.md\` — every type, SDK method, event payload, and lock expression. Read it before writing any code.

Activate the full dev skill with: \`/ursamu-dev\`
`;
}

// ─── showcase templates ────────────────────────────────────────────────────────

export function showcaseExampleJson(name: string): string {
  return JSON.stringify(
    {
      key:   `${name}-basic`,
      label: `${name} — basic usage`,
      vars:  {},
      steps: [
        { sub: "Basic Usage" },
        { cmd: `+${name}`, label: "Default command output", output: [`Hello from the ${name} plugin!`] },
        { sub: "Error Handling" },
        { cmd: `+${name} unknown-target`, label: "Nonexistent target", output: ["Not found."] },
        { note: "Add more steps as you build out the plugin." },
        { reset: true },
      ],
    },
    null,
    2,
  );
}

export function standaloneShowcaseTs(): string {
  return `#!/usr/bin/env -S deno run -A
// Showcase runner — executes commands in-process against the real plugin.
// Usage: deno task showcase [key] [--list]
import { parse }       from "jsr:@std/flags@^0.224.0";
import { expandGlob }  from "jsr:@std/fs@^0.224.0";
import { join }        from "jsr:@std/path@^0.224.0";

// ── Types ─────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type IDBObj = { id: string; name?: string; flags: Set<string>; state: Record<string, any>; contents: unknown[]; [k: string]: unknown };
// deno-lint-ignore no-explicit-any
type IUrsamuSDK = any;
interface ShowcaseStep { sub?: string; note?: string; reset?: boolean; emit?: string; expect?: string; cmd?: string; as?: string; label?: string }
interface ShowcaseFile { key: string; label: string; vars?: Record<string, string>; steps: ShowcaseStep[] }

// ── ANSI / MUSH ───────────────────────────────────────────────────────────────

const RESET = "\\x1b[0m", BOLD = "\\x1b[1m", DIM = "\\x1b[2m";
const MUSH: Record<string, string> = {
  "%ch": BOLD, "%cn": RESET,
  "%cr": "\\x1b[31m", "%cg": "\\x1b[32m", "%cb": "\\x1b[34m",
  "%cy": "\\x1b[33m", "%cw": "\\x1b[37m", "%cc": "\\x1b[36m",
  "%r": "\\n", "%t": "\\t",
};
const mush = (s: string) => s.replace(/%c[a-z]|%[rtnb]/g, (m) => MUSH[m] ?? "");
const itrp = (s: string, v: Record<string, string>) =>
  s.replace(/{{(\\w+)}}/g, (_, k) => v[k] ?? "{{" + k + "}}");

// ── In-memory DBO store ───────────────────────────────────────────────────────
// Shared across all commands in one showcase run. Cleared by { reset: true } steps.

// deno-lint-ignore no-explicit-any
const _store: Map<string, Record<string, any>> = new Map();

// deno-lint-ignore no-explicit-any
function dotSet(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(".");
  // deno-lint-ignore no-explicit-any
  let cur: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// deno-lint-ignore no-explicit-any
function dotDelete(obj: Record<string, any>, path: string): void {
  const parts = path.split(".");
  // deno-lint-ignore no-explicit-any
  let cur: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null) return; cur = cur[parts[i]]; }
  delete cur[parts[parts.length - 1]];
}

function buildMockPlayer(name: string, flags: string[] = []): IDBObj {
  return { id: "mock-" + name.toLowerCase().replace(/\\s+/g, "-"), name, flags: new Set(["connected", ...flags]), state: {}, contents: [] };
}

function buildMockDb(player: IDBObj) {
  return {
    // deno-lint-ignore no-explicit-any
    modify: async (id: string, op: string, fields: Record<string, any>) => {
      const rec = _store.get(id) ?? {};
      if (op === "$set")   for (const [k, v] of Object.entries(fields)) { dotSet(rec, k, v);  if (id === player.id) dotSet(player as unknown as Record<string, unknown>, k, v); }
      if (op === "$inc")   for (const [k, v] of Object.entries(fields)) { const n = ((rec[k] as number) ?? 0) + (v as number); rec[k] = n; if (id === player.id) dotSet(player as unknown as Record<string, unknown>, k, n); }
      if (op === "$unset") for (const k of Object.keys(fields)) { dotDelete(rec, k); if (id === player.id) dotDelete(player as unknown as Record<string, unknown>, k); }
      _store.set(id, rec); return rec;
    },
    // deno-lint-ignore no-explicit-any
    create: async (doc: Record<string, any>) => { const r = { id: crypto.randomUUID(), ...doc }; _store.set(r.id, r); return r; },
    delete: async (id: string) => { _store.delete(id); },
    // deno-lint-ignore no-explicit-any
    find: async (_q: Record<string, any>) => [] as Record<string, any>[],
  };
}

function buildMockSDK(player: IDBObj, cmdName: string, args: (string | undefined)[], output: string[]): IUrsamuSDK {
  const noop = async () => {};
  return {
    me: player, cmd: { name: cmdName, original: "", args: args as string[] },
    here: { id: "mock-room", name: "Room", flags: new Set(), state: {}, contents: [], broadcast: () => {} },
    send(msg: string) { output.push(msg); },
    db: buildMockDb(player),
    util: {
      stripSubs: (s: string) => s.replace(/\\x1b\\[[^m]*m/g, "").replace(/%c[a-z]/gi, ""),
      center: (s: string, len: number, fill = " ") => { const plain = s.replace(/%c[a-z]/gi,"").replace(/%[rtnb]/gi,""); const pad = Math.max(0, len - plain.length); return fill.repeat(Math.floor(pad/2)) + s + fill.repeat(pad - Math.floor(pad/2)); },
      target: async (_actor: IDBObj, query: string) => query.toLowerCase() === "admin" ? buildMockPlayer("Admin", ["admin"]) : undefined,
      displayName: (o: IDBObj) => o.name ?? o.id,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    canEdit: async () => true,
    broadcast: () => {},
    chan: { create: noop, destroy: noop, set: noop, history: async () => [] },
    events: { emit: () => {}, on: () => {}, off: () => {} },
  } as unknown as IUrsamuSDK;
}

// ── Command execution ─────────────────────────────────────────────────────────
// Imports commands.ts once (addCmd side effects fire), then matches each cmd
// step against the live registry and calls cmd.exec(u) with the mock SDK.

let _loaded = false;
async function ensureLoaded() {
  if (_loaded) return; _loaded = true;
  await import("../commands.ts");
}

async function execCmd(raw: string, player: IDBObj): Promise<string[]> {
  await ensureLoaded();
  const { cmds } = await import("jsr:@ursamu/ursamu");
  const output: string[] = [];
  for (const cmd of cmds) {
    const m = raw.trim().match(cmd.pattern);
    if (!m) continue;
    const u = buildMockSDK(player, cmd.name, m.slice(1), output);
    try { await cmd.exec(u); } catch (e) { output.push("%ch%cr>> exec error: " + (e as Error).message + "%cn"); }
    return output;
  }
  output.push("%cw>> no command matched: " + raw + "%cn");
  return output;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

async function renderStep(step: ShowcaseStep, vars: Record<string, string>, player: IDBObj, admin: IDBObj): Promise<void> {
  if (step.sub    != null) { console.log("\\n" + DIM + "── " + step.sub + " " + "─".repeat(Math.max(0, 66 - step.sub.length)) + RESET); return; }
  if (step.note   != null) { console.log("  " + DIM + itrp(step.note, vars) + RESET); return; }
  if (step.reset)          { _store.clear(); console.log("  " + DIM + "[state reset]" + RESET); return; }
  if (step.emit   != null) { console.log("  " + BOLD + "emit " + RESET + mush(itrp(step.emit, vars)) + (step.label ? "  " + DIM + "# " + step.label + RESET : "")); return; }
  if (step.expect != null) { console.log("  " + DIM + "expect → " + step.expect + RESET); return; }
  if (step.cmd    != null) {
    const raw    = itrp(step.cmd, vars);
    const actor  = step.as === "admin" ? admin : player;
    const roleNt = step.as ? "  " + DIM + "[as: " + step.as + "]" + RESET : "";
    const lbl    = step.label ? "  " + DIM + "# " + step.label + RESET : "";
    console.log("  " + BOLD + "> " + raw + RESET + roleNt + lbl);
    const lines = await execCmd(raw, actor);
    for (const line of lines) for (const r of mush(line).split("\\n")) if (r.trim()) console.log("     " + r);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parse(Deno.args, { boolean: ["list", "help"], alias: { h: "help", l: "list" } });
  if (args.help) { console.log("Usage: deno task showcase [key] [--list]\\n  --list  List all showcases\\n  --help  Show help"); return; }

  const files: ShowcaseFile[] = [];
  for await (const e of expandGlob(join(Deno.cwd(), "showcases", "*.json"))) {
    try { files.push(JSON.parse(await Deno.readTextFile(e.path)) as ShowcaseFile); } catch { /* skip */ }
  }
  if (files.length === 0) { console.log("No showcase files found in showcases/"); return; }

  if (args.list) {
    console.log("\\nAvailable showcases:\\n");
    for (const f of files) console.log("  " + BOLD + f.key + RESET + "  " + DIM + f.label + RESET);
    return;
  }

  const key    = args._[0]?.toString();
  const chosen = key ? files.find((f) => f.key === key) : files[0];
  if (!chosen) { console.error("Showcase '" + (key ?? "") + "' not found. Run --list to see keys."); return; }

  const player = buildMockPlayer(chosen.vars?.player ?? "Showcase Player");
  const admin  = buildMockPlayer("Admin", ["admin", "wizard"]);
  const vars   = chosen.vars ?? {};

  console.log("\\n" + BOLD + "═".repeat(70) + RESET);
  console.log(BOLD + "  " + chosen.label + RESET);
  console.log(BOLD + "═".repeat(70) + RESET);
  for (const step of chosen.steps) await renderStep(step, vars, player, admin);
  console.log("\\n" + DIM + "─".repeat(70) + RESET + "\\n");
}

await main();
`;
}

export function gameClaude(name: string): string {
  return `# ${name} — UrsaMU Game Server

## What This Is

A UrsaMU game server built on \`jsr:@ursamu/ursamu\`. UrsaMU is a TypeScript/Deno
MUSH-like engine with a full TinyMUX 2.x softcode evaluator, plugin system,
WebSocket API, and optional Telnet sidecar.

This repo contains **only game-specific code** — plugins, softcode scripts,
chargen, help files, and configuration. The engine lives at \`jsr:@ursamu/ursamu\`.

## Tech Stack

| Layer | Tech |
|---|---|
| Engine | \`jsr:@ursamu/ursamu\` (v2.x) |
| Runtime | Deno |
| Database | Deno KV (embedded) |
| Softcode | TinyMUX 2.x evaluator (built into engine) |
| Web client | Served by engine at \`/client\` (via web-client plugin) |
| Telnet | Optional sidecar (\`src/telnet.ts\`) |

## Project Structure

\`\`\`
${name}/
├── CLAUDE.md                  ← you are here
├── deno.json                  ← tasks, import map, engine version pin
├── plugins.manifest.json      ← installed plugins (managed by ensurePlugins)
├── config/                    ← game config (gitignored: config.json)
│   └── config.sample.json     ← template — copy to config.json to run
├── src/
│   ├── main.ts                ← entry point: imports engine + local plugins
│   ├── telnet.ts              ← telnet sidecar entry point
│   └── plugins/               ← local game plugins (each in own subdirectory)
│       ├── chargen/           ← character generation system
│       │   └── index.ts       ← implements IStatSystem, registers with engine
│       └── [feature]/         ← additional game plugins
├── system/
│   └── scripts/               ← softcode scripts (@commands, $patterns)
├── help/                      ← help file entries (plain text)
├── text/                      ← motd, connect screen, other text files
├── tests/                     ← Deno test files
└── logs/                      ← runtime logs (gitignored)
\`\`\`

## Running the Server

\`\`\`bash
# First-time setup
cp config/config.sample.json config/config.json
# Edit config.json with your game settings

# Development (with --watch)
deno task server

# Full stack (server + telnet)
deno task dev

# Run tests
deno task test
\`\`\`

**Ports (defaults):**
- \`4202\` — Hub WebSocket + HTTP API
- \`4203\` — native WebSocket upgrades
- \`4201\` — Telnet (sidecar)

## Plugin System

Plugins are either:

1. **Local** — TypeScript files in \`src/plugins/\`. Register in \`src/main.ts\`.
2. **External** — JSR/GitHub packages listed in \`plugins.manifest.json\`.
   The engine's \`ensurePlugins\` auto-fetches and loads them on startup.

### Writing a local plugin

\`\`\`ts
// src/plugins/myplugin/index.ts
import { registerPlugin } from "ursamu";

registerPlugin({
  name: "myplugin",
  version: "1.0.0",
  async init() {
    // register scripts, commands, routes, etc.
  },
});
\`\`\`

### Registering a softcode script

\`\`\`ts
import { registerScript } from "ursamu";
import { join } from "@std/path";

await registerScript("myscript", await Deno.readTextFile(
  join(import.meta.dirname!, "scripts/myscript.ts")
));
\`\`\`

## Chargen / Stat System

Implement \`IStatSystem\` and register it so the engine's chargen and sheet
commands can resolve stats without importing engine internals.

\`\`\`ts
import { registerStatSystem } from "ursamu";

registerStatSystem({
  name: "${name.toLowerCase().replace(/\s+/g, "-")}",
  version: "1.0.0",
  getCategories: () => ["Attributes", "Skills"],
  getStats: (cat) => cat === "Attributes" ? ["Strength", "Dexterity", "Stamina"] : [],
  getStat: (actor, stat) => actor[stat.toLowerCase()] ?? 0,
  setStat: async (actor, stat, value) => { actor[stat.toLowerCase()] = value; },
  validate: (stat, value) => typeof value === "number" && value >= 1 && value <= 5,
});
\`\`\`

Use \`/ursamu-chargen\` to generate a chargen plugin from a rulebook PDF.

## Softcode Scripts

Engine lookup order: **local override → plugin registry → engine bundled**.

Put game-specific \`@command\` and \`$pattern\` scripts in \`system/scripts/\`.
Register them in a plugin's \`init()\` with \`registerScript()\`.

Scripts run in Web Workers (sandboxed). Access services via the \`u\` SDK —
do NOT import engine services directly inside scripts.

Useful SDK methods:
- \`u.db.search(query)\` — search objects; \`u.db.create()\`, \`u.db.modify(id, op, data)\`, \`u.db.destroy(id)\`
- \`u.ui.layout()\` — send structured UI to client
- \`u.cmd.switches\` — parsed command switches
- \`u.util.stripSubs(str)\` — strip MUSH substitutions and ANSI (always call before DB ops)
- \`u.eval(targetId, attr, args)\` — evaluate a softcode attribute
- \`u.forceAs(targetId, command)\` — execute a command as another actor

## AI GM Integration (optional)

If using \`@ursamu/ai-gm\`, connect your stat system via the game hooks bridge —
do NOT import ai-gm directly from chargen plugins:

\`\`\`ts
// In your plugin's init():
import { gameHooks } from "ursamu";

gameHooks.emit("gm:system:register" as never, { system: myStatSystem });
\`\`\`

## Key Engine Patterns

**Privilege levels** (for \`@tel\`, \`@force\`, admin commands):
- \`superuser\` (3) → \`admin\` (2) → \`wizard\` (1) → \`player\` (0)

**Flags:** \`"wizard"\` is level 9, code \`"wiz"\`, locked to superuser.
Use \`isStaff(flags)\` and \`isWizard(flags)\` utilities (exported from engine).

**Hidden/internal attributes:** prefix with \`_\` to make wiz-only.
Use \`_COR_*\` naming for internal system state.

**Comment detection in softcode:** \`/*\` is only a comment opener at the start
of a line (\`^\\s*/\\*\`). Do not treat \`*/*\` or \`<tag>/*\` as comments.

**DB IDs in tests:** prefix to avoid collision — \`"si_actor1"\`, \`"ta_room1"\`.

**wrapScript pattern for tests:**
\`\`\`ts
// Required when importing any service layer (CmdParser triggers async reads):
const OPTS = { sanitizeResources: false, sanitizeOps: false };
\`\`\`

## Developer Tooling (ursamu-dev)

\`@lhi/ursamu-dev\` guides AI agents and human developers through proper UrsaMU
plugin development with static analysis, scaffolding, and documentation generation.

### Installation

\`\`\`bash
# Install the package (Node 18+ required)
npx @lhi/ursamu-dev

# Install Git pre-commit hooks (blocks commits that fail audit)
ursamu-dev --install-hooks
\`\`\`

Then activate the skill in Claude Code with: \`/ursamu-dev\`

### Tools

| Command | Purpose |
|---|---|
| \`ursamu-dev\` | Installs the AI coding skill into your agent |
| \`ursamu-scaffold\` | Generates plugin boilerplate with correct structure and help files |
| \`ursamu-audit\` | Static analysis — catches violations before they reach the engine |
| \`ursamu-docs\` | Auto-generates documentation from source (requires LLM API key) |

### Workflow

\`\`\`bash
# During development — live feedback
ursamu-audit --watch

# Auto-repair common violations
ursamu-audit --fix
\`\`\`

Six-stage pipeline: **Design → Generate → Audit → Refine → Test → Docs**

Source: https://github.com/UrsaMU/ursamu-dev-skill

## Testing

\`\`\`bash
deno task test
deno lint
\`\`\`

Tests live in \`tests/\`. Mirror the file being tested:
\`src/plugins/chargen/index.ts\` → \`tests/chargen.test.ts\`.

Always close the DB in the last test of any file:
\`\`\`ts
await DBO.close();
\`\`\`

## Environment / Config

Copy \`config/config.sample.json\` → \`config/config.json\`. Never commit
\`config.json\` (it is gitignored). Never hardcode credentials.
`;
}
