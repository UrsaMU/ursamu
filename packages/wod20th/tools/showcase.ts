#!/usr/bin/env -S deno run -A
// Showcase runner -- executes commands in-process against the real plugin.
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
  description?: string;
  zone?: string;
  /** Optional per-reality-plane descriptions. */
  descriptions?: Record<string, string>;
  penumbraDescription?: string;
  /** Optional Gauntlet difficulty 2-10 for Garou stepping sideways here. */
  gauntlet?: number;
}

interface ShowcaseAttr { name: string; value: string }

interface ShowcaseThing {
  name: string;
  desc?: string;
  description?: string;
  attributes?: ShowcaseAttr[];
  contents?: string[];
}

interface ShowcaseExit {
  name: string;
  desc?: string;
  description?: string;
  destination?: string;
  type?: string;
  attributes?: ShowcaseAttr[];
}

interface ShowcaseSetup {
  character?: CharacterSetup;
  targets?: Record<string, CharacterSetup>;
  room?: ShowcaseRoom;
  things?: ShowcaseThing[];
  exits?: ShowcaseExit[];
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
    get: async (id: string) => _store.get(id) ?? null,
    // deno-lint-ignore no-explicit-any
    modify: async (id: string, op: string, fields: Record<string, any>) => {
      const existing = _store.get(id) ?? {};
      if (op === "$set") {
        for (const [k, v] of Object.entries(fields)) {
          dotSet(existing, k, v);
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
  // Seed roomState from any prior _store writes so mutations (initiative,
  // pose counts, plane flags) persist across steps in the same showcase.
  const priorRoom = _store.get("mock-room");
  const roomState: Record<string, unknown> = priorRoom?.state
    ? { ...(priorRoom.state as Record<string, unknown>) }
    : {};
  const roomDesc = roomCfg?.description ?? roomCfg?.desc;
  if (roomDesc) {
    roomState.desc = roomDesc;
    roomState.description = roomDesc;
  }
  if (roomCfg?.descriptions) roomState.descriptions = roomCfg.descriptions;
  if (roomCfg?.penumbraDescription) roomState.penumbraDescription = roomCfg.penumbraDescription;
  if (typeof roomCfg?.gauntlet === "number") roomState.gauntlet = roomCfg.gauntlet;
  if (roomCfg?.zone)  roomState.zone  = roomCfg.zone;
  const here: IDBObj = {
    id: "mock-room",
    name: roomCfg?.name ?? "Showcase Room",
    flags: new Set(["room"]),
    state: roomState,
    contents: [..._store.values()].filter(
      (o) => o.location === "mock-room" && o.id !== "mock-room",
    ) as IDBObj[],
    broadcast: (msg: string, _opts?: Record<string, unknown>) => {
      // Surface room-broadcasts in the showcase so we can verify pose flavor.
      output.push(`%cx[room]%cn ${msg}`);
    },
  };
  return {
    me: player,
    here,
    cmd: { name: cmdName, original: "", args: args as string[] },
    send(msg: string) { output.push(msg); },
    db: {
      ...buildMockDb(player),
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
          const raw = String(obj.state?.name ?? obj.name ?? "");
          const first = raw.split(";")[0]?.trim().toLowerCase();
          if (first === q || raw.toLowerCase() === q) return obj as IDBObj;
        }
        return undefined;
      },
      displayName: (obj: IDBObj) => {
        const raw = String(obj?.state?.name ?? obj?.name ?? "");
        return raw.split(";")[0] || raw;
      },
      search: async () => [],
      create: async (t: Partial<IDBObj>) => ({ ...buildMockPlayer(t.name ?? "obj"), ...t }),
      resolveFormat: async () => null,
      getMapData: () => null,
    },
    ui: { panel: noopSync, layout: noopSync },
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

// Cache the processed look.ts (with placeholders substituted from the active
// sgp theme overlay). Mirrors what sgp's installer does at deploy time so the
// showcase reflects the wod20th theme overlay (ROLE_TAGS, showIdle, etc.).
// deno-lint-ignore no-explicit-any
let _lookScriptCache: ((u: any) => Promise<void>) | null = null;
// deno-lint-ignore no-explicit-any
async function loadProcessedLookScript(): Promise<(u: any) => Promise<void>> {
  if (_lookScriptCache) return _lookScriptCache;
  const sgpLookPath = new URL(
    "../../../../ursamu-sgp-plugin/scripts/look.ts",
    import.meta.url,
  );
  let src = await Deno.readTextFile(sgpLookPath);
  const { currentTheme } = await import("@ursamu/globals");
  const theme = currentTheme();
  // Mirror sgp's SCRIPT_TRANSFORMS["look.ts"] — substitute the install-time
  // placeholders for role tags, showIdle, and showShortDesc.
  const tags = JSON.stringify(theme.look.roleTags);
  src = src
    .replace(
      /\/\*\s*\{\{ROLE_TAGS\}\}\s*\*\/\s*\[[\s\S]*?\];/m,
      `/* {{ROLE_TAGS}} */ ${tags};`,
    )
    .replace(
      /\/\*\s*\{\{SHOW_IDLE\}\}\s*\*\/\s*(?:true|false);/m,
      `/* {{SHOW_IDLE}} */      ${theme.look.showIdle};`,
    )
    .replace(
      /\/\*\s*\{\{SHOW_SHORTDESC\}\}\s*\*\/\s*(?:true|false);/m,
      `/* {{SHOW_SHORTDESC}} */ ${theme.look.showShortDesc};`,
    )
    .replace(
      /\/\*\s*\{\{ALIAS_CASE\}\}\s*\*\/\s*"(?:upper|lower|preserve)";/m,
      `/* {{ALIAS_CASE}} */ "${theme.look.aliasCase}";`,
    )
    .replace(
      /\/\*\s*\{\{BORDER_COLOR\}\}\s*\*\/\s*"[^"]*";/m,
      `/* {{BORDER_COLOR}} */ ${JSON.stringify(theme.colors.border)};`,
    )
    .replace(
      /\/\*\s*\{\{TITLE_COLOR\}\}\s*\*\/\s*"[^"]*";/m,
      `/* {{TITLE_COLOR}}  */ ${JSON.stringify(theme.tokens.title)};`,
    )
    .replace(
      /\/\*\s*\{\{RESET_COLOR\}\}\s*\*\/\s*"[^"]*";/m,
      `/* {{RESET_COLOR}}  */ ${JSON.stringify(theme.colors.reset)};`,
    );
  // Rewrite the SDK type import — the source uses a relative engine path that
  // doesn't resolve from a temp dir. We don't need real types at runtime.
  src = src.replace(
    /import\s+type[^;]*;\s*\n/,
    "// deno-lint-ignore-file no-explicit-any\ntype IUrsamuSDK = any; type IDBObj = any;\n",
  );
  // Rewrite sgp-internal relative imports to absolute paths so the temp file
  // can resolve them. Required after sgp's look.ts began importing renderer.ts
  // for themed header/divider/footer.
  const sgpSrcDir = new URL("../src/", sgpLookPath).href;
  src = src.replace(
    /from\s+"\.\.\/src\/([^"]+)"/g,
    (_m, rel) => `from "${sgpSrcDir}${rel}"`,
  );
  const tmp = await Deno.makeTempFile({ prefix: "wod20th-look-", suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  const mod = await import("file://" + tmp);
  _lookScriptCache = mod.default;
  return _lookScriptCache!;
}

let _cmdsLoaded = false;
async function ensureCmdsLoaded() {
  if (_cmdsLoaded) return;
  _cmdsLoaded = true;
  await import("../commands.ts");
  // Run plugin init() so registerFormatHandler() calls fire.
  try {
    const mod = await import("../index.ts");
    const p = (mod as { plugin?: { init?: () => boolean } }).plugin;
    p?.init?.();
    // setTheme() inside init() is fire-and-forget; ensure the wod20th overlay
    // is fully applied before any consumer reads currentTheme().
    const { setTheme } = await import("@ursamu/globals");
    const { wod20thGlobalsOverlay } = await import("../core/globalsTheme.ts");
    await setTheme(wod20thGlobalsOverlay);
  } catch (e) {
    console.warn("  [showcase] plugin init failed: " + (e as Error).message);
  }
}

async function execCmd(raw: string, player: IDBObj, roomCfg?: ShowcaseRoom): Promise<string[]> {
  await ensureCmdsLoaded();
  const output: string[] = [];

  // Route look through sgp's installed system-script (it isn't an addCmd).
  const lookMatch = raw.trim().match(/^(look|l|loo)(?:\s+(.+))?$/i);
  if (lookMatch) {
    const arg = (lookMatch[2] ?? "").trim();
    const u = buildMockSDK(player, "look", [arg || undefined], output, roomCfg);
    let target: IDBObj | undefined;
    if (arg) {
      target = await u.util.target(u.me, arg);
      if (!target) {
        const q = arg.toLowerCase();
        for (const obj of _store.values()) {
          const raw = String((obj as IDBObj).state?.name ?? (obj as IDBObj).name ?? "");
          if (raw.split(";").map((p: string) => p.trim().toLowerCase()).includes(q)) {
            target = obj as IDBObj; break;
          }
        }
      }
    }
    (u as { target?: IDBObj }).target = target;
    try {
      const lookScript = await loadProcessedLookScript();
      await lookScript(u as Parameters<typeof lookScript>[0]);
    } catch (e) {
      output.push(`%ch%cr>> exec error: ${(e as Error).message}%cn`);
    }
    return output;
  }

  const { cmds } = await import("@ursamu/ursamu");
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
    console.log("\n" + DIM + "-- " + step.sub + " " + "-".repeat(Math.max(0, 66 - step.sub.length)) + RESET);
    return;
  }
  if ("note" in step && step.note != null) {
    console.log("  " + DIM + itrp(String(step.note), vars) + RESET);
    return;
  }
  if ("reset" in step) {
    _store.clear();
    await clearWodKv();
    console.log("  " + DIM + "[state reset]" + RESET);
    return;
  }
  if ("emit" in step && step.emit != null) {
    console.log("  " + BOLD + "emit " + RESET + mush(itrp(step.emit, vars)) +
      (step.label ? "  " + DIM + "# " + step.label + RESET : ""));
    return;
  }
  if ("expect" in step && step.expect != null) {
    console.log("  " + DIM + "expect -> " + step.expect + RESET);
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
    console.log(BOLD + CYAN + "  WoD20th Showcases" + RESET + DIM + "  -- ^v navigate  Enter select  q quit" + RESET);
    console.log(DIM + "  " + "-".repeat(50) + RESET);
    for (let i = 0; i < sorted.length; i++) {
      const sel = i === idx;
      console.log((sel ? GREEN + "  > " + BOLD : "    " + DIM) + sorted[i].label + RESET);
    }
    console.log(DIM + "  " + "-".repeat(50) + RESET);
  };
  console.log(BOLD + CYAN + "  WoD20th Showcases" + RESET + DIM + "  -- ^v navigate  Enter select  q quit" + RESET);
  console.log(DIM + "  " + "-".repeat(50) + RESET);
  for (let i = 0; i < sorted.length; i++) {
    const sel = i === idx;
    console.log((sel ? GREEN + "  > " + BOLD : "    " + DIM) + sorted[i].label + RESET);
  }
  console.log(DIM + "  " + "-".repeat(50) + RESET);
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

// Seed through the plugin's own charDb DBO (same TypeGraph adapter the
// commands read). Previously this wrote raw Deno KV while findByPlayer
// queried TypeGraph/PGlite, so showcases saw "No character on file."
import {
  createChar,
  deleteChar,
  saveChar,
} from "../db/charDb.ts";
import { deletePack, findAllPacks } from "../db/packDb.ts";
import { deleteCaern, findAllCaerns } from "../db/caernDb.ts";
import { deleteSept, findAllSepts } from "../db/septDb.ts";
import { deleteMoot, findAllMoots } from "../db/mootDb.ts";
import type { IWoDChar } from "../core/types.ts";

async function seedKvChar(id: string, char: Record<string, unknown>): Promise<void> {
  try {
    const splat = (char.splat as string | undefined) ?? "wta";
    const playerId = (char.playerId as string | undefined) ?? id;
    const rec = await createChar(playerId, splat as IWoDChar["splat"]);
    // Overlay every provided field, then persist through saveChar so the
    // record lands in the exact shape findByPlayer expects.
    Object.assign(rec, char, { id: rec.id, playerId });
    await saveChar(rec);
  } catch (e) {
    console.warn("  [showcase] could not seed char " + id + ": " + (e as Error).message);
  }
}

async function clearWodKv(): Promise<void> {
  // Wipe every record the showcase might have created, via each DBO's
  // own delete path (guarantees adapter parity with the plugin).
  try {
    for (const p of await findAllPacks()) await deletePack(p.id);
    for (const c of await findAllCaerns()) await deleteCaern(c.id);
    for (const s of await findAllSepts()) await deleteSept(s.id);
    for (const m of await findAllMoots()) await deleteMoot(m.id);
  } catch { /* collections optional per-showcase */ }
  // Chars: scan the chars collection through its own DBO and delete.
  try {
    const { DBO } = await import("@ursamu/ursamu");
    const charsDb = new DBO<{ id: string }>("wod20th.chars");
    for (const rec of await charsDb.find({})) await deleteChar(rec.id);
  } catch { /* fresh database: nothing to clear */ }
  // Legacy raw-KV cleanup (older showcases seeded here; harmless if absent).
  try {
    const kv = await Deno.openKv("./data/ursamu.db");
    for await (const entry of kv.list({ prefix: ["wod20th_chars"] })) {
      await kv.delete(entry.key);
    }
    kv.close();
  } catch { /* raw KV may not exist when TypeGraph is primary */ }
}

async function runShowcase(sf: ShowcaseFile): Promise<void> {
  _store.clear();
  await clearWodKv();
  const vars = sf.vars ?? {};
  const state: RunState = {
    player: buildMockPlayer(vars.player ?? "Player"),
    adminPlayer: buildMockPlayer("Admin", ["admin", "wizard"]),
    targetPlayers: new Map(),
    setup: sf.setup,
  };

  state.player.flags.add("player");
  state.player.location = "mock-room";
  const playerRec: Record<string, unknown> = {
    id: state.player.id, name: state.player.name,
    flags: state.player.flags, state: {}, contents: [],
    location: "mock-room",
  };
  if (sf.setup?.character) {
    const { _state: metaState, _char: charRec, _flags: charFlags, _carrying: charCarrying, ...wodData } = sf.setup.character;
    if (Array.isArray(charFlags)) {
      for (const fl of charFlags as string[]) {
        state.player.flags.add(fl);
      }
    }
    dotSet(playerRec, "state.wod20th", wodData);
    dotSet(state.player as unknown as Record<string, unknown>, "state.wod20th", wodData);
    if (metaState && typeof metaState === "object") {
      for (const [k, v] of Object.entries(metaState as Record<string, unknown>)) {
        dotSet(playerRec, `state.${k}`, v);
        dotSet(state.player as unknown as Record<string, unknown>, `state.${k}`, v);
      }
    }
    if (Array.isArray(charCarrying)) {
      const refs: unknown[] = [];
      for (const item of charCarrying as Array<{ name: string; desc?: string; state?: Record<string, unknown> }>) {
        const iid = `mock-carry-${state.player.id}-${item.name.toLowerCase().replace(/\s+/g, "-")}`;
        const istate: Record<string, unknown> = { name: item.name };
        if (item.desc) istate.description = item.desc;
        if (item.state) Object.assign(istate, item.state);
        const irec = {
          id: iid, name: item.name,
          flags: new Set(["thing"]),
          state: istate,
          contents: [],
          location: state.player.id,
        };
        _store.set(iid, irec);
        refs.push(irec);
      }
      playerRec.contents = refs;
      (state.player as unknown as { contents: unknown[] }).contents = refs;
    }
    if (charRec && typeof charRec === "object") {
      const seeded = { ...charRec, playerId: state.player.id } as Record<string, unknown>;
      if (!seeded.id) seeded.id = crypto.randomUUID();
      await seedKvChar(seeded.id as string, seeded);
    }
  }
  _store.set(state.player.id, playerRec);
  _store.set(state.adminPlayer.id, {
    id: state.adminPlayer.id, name: state.adminPlayer.name,
    flags: state.adminPlayer.flags, state: {}, contents: [],
  });

  if (sf.setup?.targets) {
    for (const [targetName, charData] of Object.entries(sf.setup.targets)) {
      const targetId = `mock-${targetName.toLowerCase().replace(/\s+/g, "-")}`;
      const rec: Record<string, unknown> = {
        id: targetId, name: targetName,
        flags: new Set(["connected", "player"]), state: {}, contents: [],
        location: "mock-room",
      };
      if (charData) {
        const { _state: metaState, _char: _ignored, ...wodData } = charData;
        if (Object.keys(wodData).length > 0) dotSet(rec, "state.wod20th", wodData);
        if (metaState && typeof metaState === "object") {
          for (const [k, v] of Object.entries(metaState as Record<string, unknown>)) {
            dotSet(rec, `state.${k}`, v);
          }
        }
      }
      if (charData?._flags && Array.isArray(charData._flags)) {
        for (const fl of charData._flags as string[]) {
          (rec.flags as Set<string>).add(fl);
        }
      }
      if (charData?._carrying && Array.isArray(charData._carrying)) {
        const refs: unknown[] = [];
        for (const item of charData._carrying as Array<{ name: string; desc?: string; state?: Record<string, unknown> }>) {
          const iid = `mock-carry-${targetId}-${item.name.toLowerCase().replace(/\s+/g, "-")}`;
          const istate: Record<string, unknown> = { name: item.name };
          if (item.desc) istate.description = item.desc;
          if (item.state) Object.assign(istate, item.state);
          const irec = {
            id: iid, name: item.name,
            flags: new Set(["thing"]),
            state: istate,
            contents: [],
            location: targetId,
          };
          _store.set(iid, irec);
          refs.push(irec);
        }
        rec.contents = refs;
      }
      _store.set(targetId, rec);

      if (charData?._char && typeof charData._char === "object") {
        const seeded = { ...charData._char, playerId: targetId } as Record<string, unknown>;
        if (!seeded.id) seeded.id = crypto.randomUUID();
        await seedKvChar(seeded.id as string, seeded);
      }

      const targetPlayer = buildMockPlayer(targetName);
      targetPlayer.location = "mock-room";
      if (charData) {
        const { _state: metaState, _char: _ignored2, ...wodData } = charData;
        dotSet(targetPlayer as unknown as Record<string, unknown>, "state.wod20th", wodData);
        if (metaState && typeof metaState === "object") {
          for (const [k, v] of Object.entries(metaState as Record<string, unknown>)) {
            dotSet(targetPlayer as unknown as Record<string, unknown>, `state.${k}`, v);
          }
        }
      }
      state.targetPlayers.set(targetName, targetPlayer);
    }
  }

  // Seed things and exits as IDBObj-shaped records in the mock room.
  if (sf.setup?.things) {
    for (const t of sf.setup.things) {
      const first = t.name.split(";")[0].trim().toLowerCase().replace(/\s+/g, "-");
      const id = `mock-thing-${first}`;
      const state: Record<string, unknown> = { name: t.name };
      const thingDesc = t.description ?? t.desc;
      if (thingDesc) state.description = thingDesc;
      if (t.attributes) state.attributes = t.attributes;
      _store.set(id, {
        id, name: t.name.split(";")[0].trim(),
        flags: new Set(["thing"]),
        state,
        contents: [],
        location: "mock-room",
      });
    }
    // Resolve thing.contents (names) into IDBObj refs and stash on parent.
    for (const t of sf.setup.things) {
      if (!t.contents?.length) continue;
      const pid = `mock-thing-${t.name.split(";")[0].trim().toLowerCase().replace(/\s+/g, "-")}`;
      const parent = _store.get(pid);
      if (!parent) continue;
      const refs: unknown[] = [];
      for (const n of t.contents) {
        const cid = `mock-thing-${n.toLowerCase().replace(/\s+/g, "-")}`;
        const child = _store.get(cid);
        if (child) refs.push(child);
      }
      parent.contents = refs;
    }
  }
  if (sf.setup?.exits) {
    for (const e of sf.setup.exits) {
      const first = e.name.split(";")[0].trim().toLowerCase().replace(/\s+/g, "-");
      const id = `mock-exit-${first}`;
      const attrs = e.attributes ? [...e.attributes] : [];
      if (e.type && !attrs.find((a) => a.name?.toUpperCase() === "TYPE")) {
        attrs.push({ name: "TYPE", value: e.type });
      }
      const state: Record<string, unknown> = { name: e.name };
      const exitDesc = e.description ?? e.desc;
      if (exitDesc) state.description = exitDesc;
      if (attrs.length) state.attributes = attrs;
      _store.set(id, {
        id, name: e.name.split(";")[0].trim(),
        flags: new Set(["exit"]),
        state,
        contents: [],
        location: "mock-room",
        destination: e.destination,
      });
    }
  }

  console.log("\n" + BOLD + "=".repeat(70) + RESET);
  console.log(BOLD + "  " + sf.label + RESET);
  console.log(BOLD + "=".repeat(70) + RESET);
  for (const step of sf.steps) {
    await renderStep(step as ShowcaseStep, vars, state);
  }
  console.log("\n" + DIM + "-".repeat(70) + RESET + "\n");
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
