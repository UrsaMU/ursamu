#!/usr/bin/env -S deno run -A
// Showcase runner — executes commands in-process against the real plugin.
// Usage: deno task showcase [key] [--list]
import { parse } from "@std/flags";
import { expandGlob } from "@std/fs";
import { join } from "@std/path";

interface IDBObj {
  id: string;
  name?: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  contents: IDBObj[];
  data?: Record<string, unknown>;
  [k: string]: unknown;
}
// deno-lint-ignore no-explicit-any
type IUrsamuSDK = any;

const RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const CYAN = "\x1b[36m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RED = "\x1b[31m";
const MUSH: Record<string, string> = {
  "%ch": BOLD, "%cn": RESET,
  "%cr": RED, "%cg": GREEN, "%cb": "\x1b[34m",
  "%cy": YELLOW, "%cw": "\x1b[37m", "%cc": CYAN, "%cm": "\x1b[35m",
  "%r": "\n", "%t": "\t",
};
const mush = (s: string) => s.replace(/%c[a-z]|%[rtnb]/g, (m) => MUSH[m] ?? "");
const itrp = (s: string, v: Record<string, string>) =>
  s.replace(/{{(\w+)}}/g, (_, k) => v[k] ?? "{{" + k + "}}");

// deno-lint-ignore no-explicit-any
type CharacterSetup = Record<string, any>;

interface ShowcaseRoom {
  name?: string;
  desc?: string;
  zone?: string;
}

interface ShowcaseSetup {
  character?: CharacterSetup;
  targets?: Record<string, CharacterSetup>;
  room?: ShowcaseRoom;
}

interface ShowcaseStep {
  sub?: string;
  note?: boolean | string;
  reset?: boolean;
  emit?: string;
  expect?: string;
  cmd?: string;
  as?: string;
  label?: string;
}

interface ShowcaseFile {
  key: string;
  label: string;
  vars?: Record<string, string>;
  setup?: ShowcaseSetup;
  steps: ShowcaseStep[];
}

function buildMockPlayer(name: string, flags: string[] = []): IDBObj {
  return {
    id: `mock-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    flags: new Set(["connected", ...flags]),
    state: {},
    contents: [],
    data: {},
    location: "mock-room",
  };
}

// In-memory DBO store shared across all commands in one showcase run.
// deno-lint-ignore no-explicit-any
const _store: Map<string, Record<string, any>> = new Map();

/** Apply a dot-notation path like "state.cpr.chargenStage" onto a nested object. */
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

function dotDelete(obj: Record<string, any>, path: string): void {
  const parts = path.split(".");
  // deno-lint-ignore no-explicit-any
  let cur: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) return;
    cur = cur[parts[i]];
  }
  delete cur[parts[parts.length - 1]];
}

// deno-lint-ignore no-explicit-any
function buildMockDb(player: IDBObj): Record<string, any> {
  return {
    // deno-lint-ignore no-explicit-any
    get: async (id: string) => _store.get(id) ?? null,
    // deno-lint-ignore no-explicit-any
    modify: async (id: string, op: string, fields: Record<string, any>) => {
      const existing = _store.get(id) ?? {};
      if (op === "$set") {
        for (const [k, v] of Object.entries(fields)) {
          dotSet(existing, k, v);
          // Mirror onto the live player object so commands see updates immediately
          if (id === player.id) dotSet(player as unknown as Record<string, unknown>, k, v);
        }
      } else if (op === "$inc") {
        for (const [k, v] of Object.entries(fields)) {
          const cur = (existing[k] as number) ?? 0;
          const next = cur + (v as number);
          existing[k] = next;
          if (id === player.id) dotSet(player as unknown as Record<string, unknown>, k, next);
        }
      } else if (op === "$unset") {
        for (const k of Object.keys(fields)) {
          dotDelete(existing, k);
          if (id === player.id) dotDelete(player as unknown as Record<string, unknown>, k);
        }
      }
      _store.set(id, existing);
      return existing;
    },
    // deno-lint-ignore no-explicit-any
    create: async (doc: Record<string, any>) => {
      const id = doc.id ?? crypto.randomUUID();
      const rec = { ...doc, id };
      _store.set(id, rec);
      return rec;
    },
    delete: async (id: string) => { _store.delete(id); },
    destroy: async (id: string) => { _store.delete(id); },
    // deno-lint-ignore no-explicit-any
    find: async (_query: Record<string, any>) => [] as Record<string, any>[],
  };
}

function buildMockSDK(
  player: IDBObj,
  cmdName: string,
  args: (string | undefined)[],
  output: string[],
  roomCfg?: ShowcaseRoom,
): IUrsamuSDK {
  const noop = async () => {};
  const noopSync = () => {};
  const roomState: Record<string, unknown> = {};
  if (roomCfg?.desc)  roomState.desc  = roomCfg.desc;
  if (roomCfg?.zone)  roomState.zone  = roomCfg.zone;
  const here: IDBObj = {
    id: "mock-room",
    name: roomCfg?.name ?? "Showcase Room",
    flags: new Set(["room"]),
    state: roomState,
    contents: [],
    broadcast: noopSync,
  };
  return {
    me: player,
    here,
    cmd: { name: cmdName, original: "", args: args as string[] },
    send(msg: string) { output.push(msg); },
    db: {
      ...buildMockDb(player),
      // Return all players in _store for occupant lists
      search: async (query: Record<string, unknown>) => {
        if (!query.flags) return [];
        const flagPat = query.flags instanceof RegExp ? query.flags : /player/i;
        return [..._store.values()].filter((o) =>
          o.flags instanceof Set
            ? (o.flags as Set<string>).has("player") && flagPat.test("player")
            : false
        ) as IDBObj[];
      },
    },
    util: {
      stripSubs: (s: string) => s.replace(/\x1b\[[^m]*m/g, "").replace(/%c[a-z]/gi, ""),
      center: (s: string, len: number, filler = " ") => {
        const plain = s.replace(/%c[a-z]/gi, "").replace(/%[rtnb]/gi, "");
        const pad = Math.max(0, len - plain.length);
        const left = Math.floor(pad / 2);
        return filler.repeat(left) + s + filler.repeat(pad - left);
      },
      target: async (_actor: IDBObj, query: string) => {
        const q = query.toLowerCase().trim();
        for (const obj of _store.values()) {
          if (obj.name != null && String(obj.name).toLowerCase() === q) return obj as IDBObj;
        }
        return undefined;
      },
      displayName: (obj: IDBObj) => obj.name ?? obj.id,
      search: async () => [],
      create: async (t: Partial<IDBObj>) => ({ ...buildMockPlayer(t.name ?? "obj"), ...t }),
    },
    canEdit: async () => true,
    checkLock: async () => true,
    auth: { verify: async () => false, whoami: async () => null },
    sys: { restart: noop, shutdown: noop, reload: noop, uptime: async () => 0 },
    chan: { create: noop, destroy: noop, set: noop, history: async () => [] },
    bb: { get: async () => null, set: noop, clear: async () => false },
    setFlags: noop,
    events: { emit: noopSync, on: noopSync, off: noopSync },
  } as unknown as IUrsamuSDK;
}

let _cmdsLoaded = false;
async function ensureCmdsLoaded() {
  if (_cmdsLoaded) return;
  _cmdsLoaded = true;
  await import("../commands.ts");
}

async function execCmd(raw: string, player: IDBObj, roomCfg?: ShowcaseRoom): Promise<string[]> {
  await ensureCmdsLoaded();
  const { cmds } = await import(
    "https://jsr.io/@ursamu/mush/2.0.0/src/services/commands/cmdParser.ts"
  );
  const output: string[] = [];
  for (const cmd of cmds) {
    const match = raw.trim().match(cmd.pattern);
    if (!match) continue;
    const u = buildMockSDK(player, cmd.name, match.slice(1), output, roomCfg);
    try {
      await cmd.exec(u);
    } catch (e) {
      output.push(`%ch%cr>> exec error: ${(e as Error).message}%cn`);
    }
    return output;
  }
  output.push(`%cw>> no command matched: ${raw}%cn`);
  return output;
}

interface RunState {
  player: IDBObj;
  adminPlayer: IDBObj;
  targetPlayers: Map<string, IDBObj>;
  setup?: ShowcaseSetup;
}

async function renderStep(
  step: ShowcaseStep,
  vars: Record<string, string>,
  state: RunState,
): Promise<void> {
  if ("sub" in step && step.sub != null) {
    console.log("\n" + DIM + "── " + step.sub + " " + "─".repeat(Math.max(0, 66 - step.sub.length)) + RESET);
    return;
  }
  if ("note" in step && step.note != null) {
    console.log("  " + DIM + itrp(String(step.note), vars) + RESET);
    return;
  }
  if ("reset" in step) {
    _store.clear();
    console.log("  " + DIM + "[state reset]" + RESET);
    return;
  }
  if ("emit" in step && step.emit != null) {
    console.log("  " + BOLD + "emit " + RESET + mush(itrp(step.emit, vars)) +
      (step.label ? "  " + DIM + "# " + step.label + RESET : ""));
    return;
  }
  if ("expect" in step && step.expect != null) {
    console.log("  " + DIM + "expect → " + step.expect + RESET);
    return;
  }
  if ("cmd" in step && step.cmd != null) {
    const raw = itrp(step.cmd, vars);
    const lbl = step.label ? "  " + DIM + "# " + step.label + RESET : "";
    const actor = step.as === "admin"
      ? state.adminPlayer
      : (step.as ? state.targetPlayers.get(step.as) ?? state.player : state.player);
    const roleNote = step.as ? "  " + DIM + "[as: " + step.as + "]" + RESET : "";
    console.log("  " + BOLD + "> " + raw + RESET + roleNote + lbl);
    const lines = await execCmd(raw, actor, state.setup?.room);
    for (const line of lines) {
      for (const rendered of mush(line).split("\n")) {
        if (rendered.trim()) console.log("     " + rendered);
      }
    }
  }
}

async function pickInteractive(files: ShowcaseFile[]): Promise<ShowcaseFile | null> {
  const sorted = [...files].sort((a, b) => a.key.localeCompare(b.key));
  let idx = 0;
  const hideCursor = () => Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
  const showCursor = () => Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
  const draw = () => {
    const lines = sorted.length + 3;
    Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${lines}A\x1b[0J`));
    console.log(BOLD + CYAN + "  CPR Showcases" + RESET + DIM + "  — ↑↓ navigate  Enter select  q quit" + RESET);
    console.log(DIM + "  " + "─".repeat(50) + RESET);
    for (let i = 0; i < sorted.length; i++) {
      const sel = i === idx;
      console.log((sel ? GREEN + "  ▶ " + BOLD : "    " + DIM) + sorted[i].label + RESET);
    }
    console.log(DIM + "  " + "─".repeat(50) + RESET);
  };
  console.log(BOLD + CYAN + "  CPR Showcases" + RESET + DIM + "  — ↑↓ navigate  Enter select  q quit" + RESET);
  console.log(DIM + "  " + "─".repeat(50) + RESET);
  for (let i = 0; i < sorted.length; i++) {
    const sel = i === idx;
    console.log((sel ? GREEN + "  ▶ " + BOLD : "    " + DIM) + sorted[i].label + RESET);
  }
  console.log(DIM + "  " + "─".repeat(50) + RESET);
  hideCursor();
  Deno.stdin.setRaw(true);
  const buf = new Uint8Array(4);
  try {
    while (true) {
      const n = await Deno.stdin.read(buf);
      if (!n) break;
      const b = buf.slice(0, n);
      if (b[0] === 13) { draw(); return sorted[idx]; }
      if (b[0] === 113 || b[0] === 3 || (b[0] === 27 && n === 1)) { return null; }
      if (b[0] === 27 && b[1] === 91 && b[2] === 65) { idx = (idx - 1 + sorted.length) % sorted.length; draw(); continue; }
      if (b[0] === 27 && b[1] === 91 && b[2] === 66) { idx = (idx + 1) % sorted.length; draw(); continue; }
    }
  } finally {
    Deno.stdin.setRaw(false);
    showCursor();
  }
  return null;
}

async function clearKvPrefix(prefix: string[]): Promise<void> {
  try {
    const kv = await Deno.openKv("./data/ursamu.db");
    const entries = kv.list({ prefix });
    for await (const entry of entries) await kv.delete(entry.key);
    kv.close();
  } catch { /* ignore if KV not available */ }
}

async function runShowcase(sf: ShowcaseFile): Promise<void> {
  _store.clear();
  await clearKvPrefix(["cpr_combat"]);
  await clearKvPrefix(["cpr_markets"]);
  await clearKvPrefix(["cpr_listings"]);
  const vars = sf.vars ?? {};
  const state: RunState = {
    player: buildMockPlayer(vars.player ?? "Player"),
    adminPlayer: buildMockPlayer("Admin", ["admin", "wizard"]),
    targetPlayers: new Map(),
    setup: sf.setup,
  };

  // Register players in store so util.target can resolve them by name
  state.player.flags.add("player");
  const playerRec: Record<string, unknown> = {
    id: state.player.id, name: state.player.name,
    flags: state.player.flags, state: {}, contents: [],
  };
  if (sf.setup?.character) {
    const { _state: metaState, ...cprData } = sf.setup.character;
    dotSet(playerRec, "state.cpr", cprData);
    dotSet(state.player as unknown as Record<string, unknown>, "state.cpr", cprData);
    if (metaState && typeof metaState === "object") {
      for (const [k, v] of Object.entries(metaState as Record<string, unknown>)) {
        dotSet(playerRec, `state.${k}`, v);
        dotSet(state.player as unknown as Record<string, unknown>, `state.${k}`, v);
      }
    }
  }
  _store.set(state.player.id, playerRec);
  _store.set(state.adminPlayer.id, {
    id: state.adminPlayer.id, name: state.adminPlayer.name,
    flags: state.adminPlayer.flags, state: {}, contents: [],
  });

  // Seed additional named targets (NPCs, secondary players, etc.)
  if (sf.setup?.targets) {
    for (const [targetName, charData] of Object.entries(sf.setup.targets)) {
      const targetId = `mock-${targetName.toLowerCase().replace(/\s+/g, "-")}`;
      const rec: Record<string, unknown> = {
        id: targetId, name: targetName,
        flags: new Set(["connected", "player"]), state: {}, contents: [],
      };
      if (charData) {
        const { _state: metaState, ...cprData } = charData;
        if (Object.keys(cprData).length > 0) dotSet(rec, "state.cpr", cprData);
        if (metaState && typeof metaState === "object") {
          for (const [k, v] of Object.entries(metaState as Record<string, unknown>)) {
            dotSet(rec, `state.${k}`, v);
          }
        }
      }
      _store.set(targetId, rec);

      // Build a live IDBObj for the target so they can run commands via "as"
      const targetPlayer = buildMockPlayer(targetName);
      targetPlayer.location = "mock-room";
      if (charData) {
        const { _state: metaState, ...cprData } = charData;
        dotSet(targetPlayer as unknown as Record<string, unknown>, "state.cpr", cprData);
        if (metaState && typeof metaState === "object") {
          for (const [k, v] of Object.entries(metaState as Record<string, unknown>)) {
            dotSet(targetPlayer as unknown as Record<string, unknown>, `state.${k}`, v);
          }
        }
      }
      state.targetPlayers.set(targetName, targetPlayer);
    }
  }

  console.log("\n" + BOLD + "═".repeat(70) + RESET);
  console.log(BOLD + "  " + sf.label + RESET);
  console.log(BOLD + "═".repeat(70) + RESET);
  for (const step of sf.steps) {
    await renderStep(step as ShowcaseStep, vars, state);
  }
  console.log("\n" + DIM + "─".repeat(70) + RESET + "\n");
}

async function main(): Promise<void> {
  const args = parse(Deno.args, { boolean: ["list", "help"], alias: { h: "help", l: "list" } });
  if (args.help) {
    console.log("Usage: deno task showcase [key] [--list]\n\n  --list   List all sections\n  --help   Show help");
    return;
  }
  const files: ShowcaseFile[] = [];
  for await (const entry of expandGlob(join(Deno.cwd(), "showcases", "*.json"))) {
    try { files.push(JSON.parse(await Deno.readTextFile(entry.path)) as ShowcaseFile); }
    catch { /* skip */ }
  }
  if (files.length === 0) { console.log("No showcase files found in showcases/"); return; }
  if (args.list) {
    console.log("\nAvailable showcases:\n");
    for (const f of files) console.log("  " + BOLD + f.key + RESET + "  " + DIM + f.label + RESET);
    return;
  }
  const key = args._[0]?.toString();
  if (key) {
    const chosen = files.find((f) => f.key === key);
    if (!chosen) { console.error("Showcase '" + key + "' not found. Run --list to see keys."); return; }
    await runShowcase(chosen);
    return;
  }
  while (true) {
    const picked = await pickInteractive(files);
    if (!picked) { console.log("\n" + DIM + "Cancelled." + RESET); Deno.exit(0); }
    await runShowcase(picked);
    console.log(DIM + "  Press any key to return to menu..." + RESET);
    Deno.stdin.setRaw(true);
    const tmp = new Uint8Array(4);
    await Deno.stdin.read(tmp);
    Deno.stdin.setRaw(false);
    console.log();
  }
}

await main();
