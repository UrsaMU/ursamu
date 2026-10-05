#!/usr/bin/env -S deno run -A --unstable-kv
// Showcase runner -- executes interlock-rolls commands in-process against the
// shim SDK. Usage: deno task showcase [key] [--list]
import { parse }      from "@std/flags";
import { expandGlob } from "@std/fs";
import { join }       from "@std/path";

// Deterministic RNG so initiative + roll outcomes are stable between runs.
// LCG (Numerical Recipes constants). Seed reset on every showcase invocation.
let __rng = 0x12345678 >>> 0;
const RNG_SEED = 0x12345678 >>> 0;
export function __resetRng(): void { __rng = RNG_SEED; }
Math.random = () => {
  __rng = (__rng * 1664525 + 1013904223) >>> 0;
  return __rng / 0x100000000;
};

// deno-lint-ignore no-explicit-any
type IDBObj = { id: string; name?: string; flags: Set<string>; state: Record<string, any>; contents: unknown[]; data?: Record<string, any>; [k: string]: unknown };
// deno-lint-ignore no-explicit-any
type IUrsamuSDK = any;
interface ShowcaseStep { sub?: string; note?: string; reset?: boolean; emit?: string; expect?: string; cmd?: string; as?: string; label?: string; connect?: string; disconnect?: string }
// deno-lint-ignore no-explicit-any
interface ShowcaseTarget { flags?: string[]; data?: Record<string, any>; state?: Record<string, any>; location?: string }
interface ShowcaseExit  { name: string; type?: string; description?: string; attributes?: Array<{ name: string; value: string }> }
interface ShowcaseObject { name: string }
interface ShowcaseSetup {
  // deno-lint-ignore no-explicit-any
  character?: { flags?: string[]; data?: Record<string, any>; state?: Record<string, any>; carrying?: string[] };
  targets?:  Record<string, ShowcaseTarget>;
  room?: {
    name?:        string;
    desc?:        string;
    description?: string;
    zone?:        string;
    gridArea?:    string;
    exits?:       ShowcaseExit[];
    objects?:     ShowcaseObject[];
  };
}
interface ShowcaseFile { key: string; label?: string; title?: string; description?: string; vars?: Record<string, string>; setup?: ShowcaseSetup; steps: ShowcaseStep[] }
const showcaseLabel = (f: ShowcaseFile): string => f.label ?? f.title ?? f.description ?? "";

// -- ANSI / MUSH ---------------------------------------------------------------

const RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const MUSH: Record<string, string> = {
  "%ch": BOLD, "%cn": RESET,
  "%cr": "\x1b[31m", "%cg": "\x1b[32m", "%cb": "\x1b[34m",
  "%cy": "\x1b[33m", "%cw": "\x1b[37m", "%cc": "\x1b[36m", "%cx": "\x1b[90m",
  "%r": "\n", "%t": "\t",
};
// Translate MUSH codes and inline <#rrggbb> hex colors to ANSI for terminal preview.
const mush = (s: string) =>
  s
    .replace(/<#([0-9a-fA-F]{6})>/g, (_, hex) => {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    })
    .replace(/%c[a-z]|%[rtnb]/g, (m) => MUSH[m] ?? "");
const itrp = (s: string, v: Record<string, string>) =>
  s.replace(/{{(\w+)}}/g, (_, k) => v[k] ?? "{{" + k + "}}");

// -- Mock world ---------------------------------------------------------------

function buildMockPlayer(name: string, flags: string[] = []): IDBObj {
  const id = "mock-" + name.toLowerCase().replace(/\s+/g, "-");
  return {
    id,
    name,
    flags: new Set(["connected", "player", ...flags]),
    state: { name, lastLogin: Date.now(), lastCommand: Date.now() },
    contents: [],
    data: { name },
    location: "mock-room",
  };
}

const MOCK_ROOM: IDBObj = {
  id: "mock-room",
  name: "Showcase Room",
  flags: new Set(["room"]),
  state: {},
  contents: [],
  broadcast(_msg: string) {},
};

function buildMockSDK(player: IDBObj, cmdName: string, args: (string | undefined)[], output: string[], allObjs: IDBObj[], roomCfg?: ShowcaseSetup["room"], dynamic?: IDBObj[]): IUrsamuSDK {
  const sid = "sid-" + player.id;
  const roomState: Record<string, unknown> = {};
  const desc = roomCfg?.description ?? roomCfg?.desc;
  if (desc)               roomState.description = desc;
  if (roomCfg?.zone)      roomState.zone = roomCfg.zone;
  if (roomCfg?.gridArea)  roomState.grid_area = roomCfg.gridArea;

  // Compose room contents: in-room players (location === "mock-room") + exits + objects
  const occupants = allObjs.filter((o) => o.location === "mock-room");
  const exits: IDBObj[] = (roomCfg?.exits ?? []).map((e, i) => {
    const attributes = [...(e.attributes ?? [])];
    if (e.type && !attributes.some((a) => a.name.toUpperCase() === "TYPE")) {
      attributes.push({ name: "TYPE", value: e.type });
    }
    const state: Record<string, unknown> = { name: e.name, attributes };
    if (e.description) state.description = e.description;
    return {
      id: `mock-exit-${i}`,
      name: e.name,
      flags: new Set(["exit"]),
      state,
      contents: [],
    };
  });
  const objects: IDBObj[] = (roomCfg?.objects ?? []).map((o, i) => ({
    id: `mock-obj-${i}`,
    name: o.name,
    flags: new Set<string>(),
    state: {},
    contents: [],
  }));

  const room = {
    ...MOCK_ROOM,
    name: roomCfg?.name ?? MOCK_ROOM.name,
    state: roomState,
    contents: [...occupants, ...exits, ...objects],
    broadcast: (msg: string) => output.push(msg),
  };
  const ui = {
    layout: () => {},
    panel: (p: unknown) => p,
  };
  return {
    id: sid,
    me: player,
    socket: { id: sid },
    cmd: { name: cmdName, original: "", args: args as string[] },
    here: room,
    send(msg: string) { output.push(msg); },
    broadcast: (msg: string) => { output.push(msg); },
    ui,
    util: {
      // deno-lint-ignore no-control-regex
      stripSubs: (s: string) => s.replace(/\x1b\[[^m]*m/g, "").replace(/%c[a-z]/gi, ""),
      target: (_a: IDBObj, q: string) => {
        const searchList = [...allObjs, ...exits, ...objects];
        return Promise.resolve(searchList.find((o) => o.id === q || o.name?.toLowerCase() === q.toLowerCase() || o.name?.toLowerCase().split(";").includes(q.toLowerCase())));
      },
      displayName: (o: IDBObj) => o.name ?? o.id,
      ljust: (s: string, w: number, fill = " ") => {
        const plain = s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
        const pad = w - plain.length;
        return pad > 0 ? s + fill.repeat(pad) : s;
      },
      rjust: (s: string, w: number, fill = " ") => {
        const plain = s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
        const pad = w - plain.length;
        return pad > 0 ? fill.repeat(pad) + s : s;
      },
      center: (s: string, w: number, fill = " ") => {
        const plain = s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
        const pad = w - plain.length;
        if (pad <= 0) return s;
        const left = Math.floor(pad / 2);
        const right = pad - left;
        return fill.repeat(left) + s + fill.repeat(right);
      },
      sprintf: (fmt: string, ...args: unknown[]) => {
        let i = 0;
        return fmt.replace(/%(-)?(\d+)?([sdifx%])/g, (_, left, width, type) => {
          if (type === "%") return "%";
          const a = args[i++];
          let val = "";
          if (type === "d" || type === "i") val = String(Math.trunc(Number(a)));
          else if (type === "f") val = String(Number(a));
          else if (type === "x") val = Number(a).toString(16);
          else val = String(a ?? "");

          if (width) {
            const w = parseInt(width, 10);
            const pad = w - val.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;
            if (pad > 0) {
              if (left) val = val + " ".repeat(pad);
              else val = " ".repeat(pad) + val;
            }
          }
          return val;
        });
      },
      header: (string = "", filler = "=", width = 78) => {
        const innerWidth = width - 4;
        const ruleTop = "%ch%cc//" + filler.repeat(innerWidth) + "\\\\%cn";
        const ruleBottom = "%ch%cc\\\\" + filler.repeat(innerWidth) + "//%cn";
        if (!string) return ruleTop;
        const titleText = `[ ${string} ]`;
        const plain = titleText.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
        const pad = innerWidth - plain.length;
        const left = Math.floor(pad / 2);
        const right = pad - left;
        const centeredTitle = " ".repeat(left) + `%ch%cy${titleText}%cn` + " ".repeat(right);
        return `${ruleTop}\n%ch%cc::%cn${centeredTitle}%ch%cc::%cn\n${ruleBottom}`;
      },
      divider: (string = "", filler = "-", width = 78) => {
        const innerWidth = width - 4;
        if (!string) return "%ch%cc//" + filler.repeat(innerWidth) + "\\\\%cn";
        const titleText = `:: ${string} ::`;
        const plain = titleText.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
        const pad = innerWidth - plain.length;
        const left = Math.floor(pad / 2);
        const right = pad - left;
        const centeredTitle = filler.repeat(left) + `%ch%cy${titleText}%cn` + filler.repeat(right);
        return `\n%ch%cc//%cn${centeredTitle}%ch%cc\\\\%cn\n`;
      },
      footer: (string = "", filler = "=", width = 78) => {
        const innerWidth = width - 4;
        const rule = "%ch%cc\\\\" + filler.repeat(innerWidth) + "//%cn";
        if (!string) return rule;
        const titleText = `[ ${string} ]`;
        const plain = titleText.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
        const pad = innerWidth - plain.length;
        const left = Math.floor(pad / 2);
        const right = pad - left;
        const centeredTitle = " ".repeat(left) + `%ch%cy${titleText}%cn` + " ".repeat(right);
        return `${rule}\n%ch%cc::%cn${centeredTitle}%ch%cc::%cn\n${rule}`;
      },
    },
    db: {
      search: (q: unknown) => {
        const searchList = [...allObjs, ...exits, ...objects];
        if (typeof q === "string") {
          const lc = q.toLowerCase();
          return Promise.resolve(searchList.filter((o) =>
            o.id.toLowerCase() === lc ||
            o.name?.toLowerCase().includes(lc) ||
            (o.state?.name as string | undefined)?.toLowerCase().includes(lc)
          ));
        }
        const shim = q as Record<string, unknown>;
        return Promise.resolve(searchList.filter((o) => {
          for (const [k, v] of Object.entries(shim)) {
            const cur = (o as Record<string, unknown>)[k];
            if (v instanceof RegExp) {
              const hs = cur instanceof Set ? [...cur].join(",") : String(cur ?? "");
              if (!v.test(hs)) return false;
            } else if (cur !== v) return false;
          }
          return true;
        }));
      },
      queryOne: (q: Record<string, unknown>) =>
        Promise.resolve(allObjs.find((o) => Object.entries(q).every(([k, v]) => (o as Record<string, unknown>)[k] === v))),
      modify: (id: string, op: string, data: Record<string, unknown>) => {
        const obj = allObjs.find((o) => o.id === id);
        if (!obj) return Promise.resolve();
        const applyPath = (root: Record<string, unknown>, path: string, fn: (parent: Record<string, unknown>, leaf: string) => void) => {
          const segs = path.split(".");
          let cur = root as Record<string, unknown>;
          for (let i = 0; i < segs.length - 1; i++) {
            const s = segs[i];
            if (cur[s] == null || typeof cur[s] !== "object") cur[s] = {};
            cur = cur[s] as Record<string, unknown>;
          }
          fn(cur, segs[segs.length - 1]);
        };
        const root = obj as unknown as Record<string, unknown>;
        // Engine convention: a `data.*` write is also reflected at `state.*`.
        const expand = (p: string) =>
          p.startsWith("data.") ? [p, "state." + p.slice(5)] : [p];
        for (const [path, value] of Object.entries(data)) {
          for (const realPath of expand(path)) {
            if (op === "$set") applyPath(root, realPath, (p, k) => { p[k] = value; });
            else if (op === "$unset") applyPath(root, realPath, (p, k) => { delete p[k]; });
            else if (op === "$inc") applyPath(root, realPath, (p, k) => { p[k] = ((p[k] as number) ?? 0) + (value as number); });
          }
        }
        return Promise.resolve();
      },
      create: (template: Partial<IDBObj>) => {
        const obj: IDBObj = {
          id: `obj-${allObjs.length + 1}-${Date.now()}`,
          name: "",
          flags: new Set<string>(),
          location: null,
          contents: [],
          ...template,
        } as IDBObj;
        // Engine convention: state.* mirrors data.*. The mock keeps both in sync.
        if ((obj as { state?: Record<string, unknown> }).state) {
          (obj as { data?: Record<string, unknown> }).data ??= {};
          for (const [k, v] of Object.entries((obj as { state: Record<string, unknown> }).state)) {
            ((obj as { data: Record<string, unknown> }).data)[k] = v;
          }
        }
        allObjs.push(obj);
        if (dynamic) dynamic.push(obj);
        if (obj.location) {
          const parent = allObjs.find((o) => o.id === obj.location);
          if (parent) {
            parent.contents = parent.contents ?? [];
            if (!parent.contents.includes(obj.id)) parent.contents.push(obj.id);
          }
        }
        return Promise.resolve(obj);
      },
      destroy: (id: string) => {
        const idx = allObjs.findIndex((o) => o.id === id);
        if (idx < 0) return Promise.resolve();
        const obj = allObjs[idx];
        if (obj.location) {
          const parent = allObjs.find((o) => o.id === obj.location);
          if (parent?.contents) {
            parent.contents = (parent.contents as string[]).filter((c) => c !== id);
          }
        }
        allObjs.splice(idx, 1);
        if (dynamic) {
          const di = dynamic.findIndex((o) => o.id === id);
          if (di >= 0) dynamic.splice(di, 1);
        }
        return Promise.resolve();
      },
    },
    canEdit: () => Promise.resolve(true),
    setFlags: (target: string | IDBObj, flags: string) => {
      const id = typeof target === "string" ? target : target.id;
      const obj = allObjs.find((o) => o.id === id);
      if (!obj) return Promise.resolve();
      obj.flags ??= new Set<string>();
      for (const tok of flags.split(/\s+/).filter(Boolean)) {
        if (tok.startsWith("!")) obj.flags.delete(tok.slice(1));
        else obj.flags.add(tok);
      }
      return Promise.resolve();
    },
    teleport: (targetId: string, destId: string) => {
      const obj = allObjs.find((o) => o.id === targetId);
      if (obj) obj.location = destId;
    },
    sys: {
      uptime: () => Promise.resolve(3725),
    },
    attr: {
      get: (id: string, name: string) => {
        const obj = allObjs.find((o) => o.id === id);
        const attrs = (obj?.data?.attributes as Array<{ name: string; value: string }> | undefined) ?? [];
        return Promise.resolve(attrs.find((a) => a.name.toUpperCase() === name.toUpperCase())?.value ?? null);
      },
      set: (id: string, name: string, value: string, type = "attribute") => {
        const obj = allObjs.find((o) => o.id === id);
        if (!obj) return Promise.resolve();
        obj.data ??= {};
        const attrs = ((obj.data as { attributes?: Array<Record<string, unknown>> }).attributes ??= []);
        const upper = name.toUpperCase();
        const existing = attrs.find((a) => String(a.name).toUpperCase() === upper);
        if (existing) { existing.value = value; existing.type = type; }
        else attrs.push({ name: upper, value, type, setter: obj.id });
        return Promise.resolve();
      },
      clear: (id: string, name: string) => {
        const obj = allObjs.find((o) => o.id === id);
        const attrs = (obj?.data?.attributes as Array<{ name: string }> | undefined);
        if (!attrs) return Promise.resolve(false);
        const upper = name.toUpperCase();
        const idx = attrs.findIndex((a) => a.name.toUpperCase() === upper);
        if (idx === -1) return Promise.resolve(false);
        attrs.splice(idx, 1);
        return Promise.resolve(true);
      },
    },
  } as unknown as IUrsamuSDK;
}

// -- Bootstrap ----------------------------------------------------------------

let _loaded = false;
let _allObjs: IDBObj[] = [];

async function ensureLoaded(objs: IDBObj[]) {
  const shim = await import("./ursamu-shim.ts");
  if (!_loaded) {
    _loaded = true;
    await import("../commands.ts");
  }
  _allObjs = objs;
  shim.__shimSeed(_allObjs);
}

async function execCmd(raw: string, actor: IDBObj, allObjs: IDBObj[], roomCfg?: ShowcaseSetup["room"], dynamic?: IDBObj[]): Promise<string[]> {
  await ensureLoaded(allObjs);
  const shim = await import("./ursamu-shim.ts");
  const output: string[] = [];
  shim.__shimSetSendSink((sids, msg) => {
    if (sids.length === 0) return;
    output.push(msg);
  });
  try {
    for (const cmd of shim.cmds) {
      const m = raw.trim().match(cmd.pattern);
      if (!m) continue;
      const u = buildMockSDK(actor, cmd.name, m.slice(1), output, allObjs, roomCfg, dynamic);
      try { await cmd.exec(u); } catch (e) { output.push("%ch%cr>> exec error: " + (e as Error).message + "%cn"); }
      return output;
    }
    output.push("%cw>> no command matched: " + raw + "%cn");
    return output;
  } finally {
    shim.__shimSetSendSink(null);
  }
}

// -- Rendering ----------------------------------------------------------------

interface RunState {
  player: IDBObj;
  admin: IDBObj;
  targets: Map<string, IDBObj>;
  setup?: ShowcaseSetup;
  dynamic: IDBObj[];
}

function actorFor(step: ShowcaseStep, state: RunState): IDBObj {
  if (!step.as) return state.player;
  if (step.as === "admin") return state.admin;
  return state.targets.get(step.as) ?? state.player;
}

function findByName(state: RunState, name: string): IDBObj | undefined {
  const lc = name.toLowerCase();
  if (state.player.name?.toLowerCase() === lc) return state.player;
  if (state.admin.name?.toLowerCase() === lc) return state.admin;
  for (const t of state.targets.values()) if (t.name?.toLowerCase() === lc) return t;
  return undefined;
}

function allObjs(state: RunState): IDBObj[] {
  return [state.player, state.admin, ...state.targets.values(), ...state.dynamic];
}

const VERIFY = true;
const failures: { key: string; step: string; expect: string; actual: string }[] = [];
let currentKey = "";
let lastOut = "";

async function renderStep(step: ShowcaseStep, vars: Record<string, string>, state: RunState): Promise<void> {
  if (step.sub    != null) { console.log("\n" + DIM + "-- " + step.sub + " " + "-".repeat(Math.max(0, 66 - step.sub.length)) + RESET); return; }
  if (step.note   != null) { console.log("  " + DIM + itrp(step.note, vars) + RESET); return; }
  if (step.reset)          { state.dynamic.length = 0; lastOut = ""; console.log("  " + DIM + "[state reset]" + RESET); return; }
  if (step.disconnect != null) {
    const o = findByName(state, step.disconnect);
    if (o) o.flags.delete("connected");
    console.log("  " + DIM + "[" + step.disconnect + " disconnected]" + RESET);
    return;
  }
  if (step.connect != null) {
    const o = findByName(state, step.connect);
    if (o) o.flags.add("connected");
    console.log("  " + DIM + "[" + step.connect + " connected]" + RESET);
    return;
  }
  if (step.emit   != null) { console.log("  " + BOLD + "emit " + RESET + mush(itrp(step.emit, vars)) + (step.label ? "  " + DIM + "# " + step.label + RESET : "")); return; }
  if (step.expect != null) {
    const want = itrp(step.expect, vars);
    const ok = lastOut.toLowerCase().includes(want.toLowerCase());
    const tag = VERIFY ? (ok ? " [OK]" : " [FAIL]") : "";
    console.log("  " + DIM + "expect -> " + want + RESET + tag);
    if (VERIFY && !ok) failures.push({ key: currentKey, step: "expect", expect: want, actual: lastOut.slice(0, 240) });
    return;
  }
  if (step.cmd    != null) {
    const raw    = itrp(step.cmd, vars);
    const actor  = actorFor(step, state);
    const roleNt = step.as ? "  " + DIM + "[as: " + step.as + "]" + RESET : "";
    const lbl    = step.label ? "  " + DIM + "# " + step.label + RESET : "";
    console.log("  " + BOLD + "> " + raw.split("\n")[0] + (raw.includes("\n") ? " ..." : "") + RESET + roleNt + lbl);
    const lines = await execCmd(raw, actor, allObjs(state), state.setup?.room, state.dynamic);
    const plain: string[] = [];
    for (const line of lines) {
      const m = mush(line);
      for (const r of m.split("\n")) {
        if (r.trim()) console.log("     " + r);
        plain.push(r);
      }
    }
    lastOut = plain.join("\n");
    if (VERIFY && /exec error/i.test(lastOut)) failures.push({ key: currentKey, step: raw, expect: "(no exec error)", actual: lastOut.slice(0, 240) });
  }
}

// -- CLI ----------------------------------------------------------------------

const CYAN = "\x1b[36m", GREEN = "\x1b[32m";

async function pickInteractive(files: ShowcaseFile[]): Promise<ShowcaseFile | null> {
  const sorted = [...files].sort((a, b) => a.key.localeCompare(b.key));
  let idx = 0;
  const enc = new TextEncoder();
  const write = (s: string) => Deno.stdout.writeSync(enc.encode(s));
  const hideCursor = () => write("\x1b[?25l");
  const showCursor = () => write("\x1b[?25h");
  const draw = (first: boolean) => {
    const lines = sorted.length + 3;
    if (!first) write(`\x1b[${lines}A\x1b[0J`);
    console.log(BOLD + CYAN + "  Mekton Zeta Showcases" + RESET + DIM + "  -- up/down navigate  Enter select  q quit" + RESET);
    console.log(DIM + "  " + "-".repeat(60) + RESET);
    for (let i = 0; i < sorted.length; i++) {
      const sel = i === idx;
      console.log((sel ? GREEN + "  > " + BOLD : "    " + DIM) + showcaseLabel(sorted[i]) + RESET);
    }
    console.log(DIM + "  " + "-".repeat(60) + RESET);
  };
  draw(true);
  hideCursor();
  Deno.stdin.setRaw(true);
  const buf = new Uint8Array(4);
  try {
    while (true) {
      const n = await Deno.stdin.read(buf);
      if (!n) break;
      const b = buf.slice(0, n);
      if (b[0] === 13)                                                  return sorted[idx];
      if (b[0] === 113 || b[0] === 3 || (b[0] === 27 && n === 1))       return null;
      if (b[0] === 27 && b[1] === 91 && b[2] === 65) { idx = (idx - 1 + sorted.length) % sorted.length; draw(false); continue; }
      if (b[0] === 27 && b[1] === 91 && b[2] === 66) { idx = (idx + 1) % sorted.length;                 draw(false); continue; }
    }
  } finally {
    Deno.stdin.setRaw(false);
    showCursor();
  }
  return null;
}

async function main(): Promise<void> {
  const args = parse(Deno.args, { boolean: ["list", "help", "all"], alias: { h: "help", l: "list", a: "all" } });
  if (args.help) { console.log("Usage: deno task showcase [key] [--list] [--all]\n  --list  List all showcases\n  --all   Run every showcase\n  --help  Show help"); return; }

  const files: ShowcaseFile[] = [];
  for await (const e of expandGlob(join(Deno.cwd(), "showcases", "*.json"))) {
    try { files.push(JSON.parse(await Deno.readTextFile(e.path)) as ShowcaseFile); } catch { /* skip */ }
  }
  if (files.length === 0) { console.log("No showcase files found in showcases/"); return; }

  if (args.all) {
    const sorted = [...files].sort((a, b) => a.key.localeCompare(b.key));
    for (const f of sorted) await runShowcase(f);
    if (VERIFY) {
      console.log("\n" + BOLD + "=== SHOWCASE VERIFY SUMMARY ===" + RESET);
      console.log("Total showcases: " + sorted.length + "  Failures: " + failures.length);
      for (const f of failures) {
        console.log("\n[" + f.key + "] step=" + f.step);
        console.log("  expect: " + f.expect);
        console.log("  actual: " + f.actual.replace(/\n/g, " | "));
      }
    }
    return;
  }
  if (args.list) {
    console.log("\nAvailable showcases:\n");
    for (const f of files) console.log("  " + BOLD + f.key + RESET + "  " + DIM + showcaseLabel(f) + RESET);
    return;
  }

  const key    = args._[0]?.toString();
  const chosen: ShowcaseFile | null = key ? (files.find((f) => f.key === key) ?? null) : null;
  if (key && !chosen) { console.error("Showcase '" + key + "' not found. Run --list to see keys."); return; }

  if (!chosen) {
    while (true) {
      const picked = await pickInteractive(files);
      if (!picked) { console.log("\n" + DIM + "Cancelled." + RESET); return; }
      await runShowcase(picked);
      console.log(DIM + "  Press any key to return to menu..." + RESET);
      Deno.stdin.setRaw(true);
      const tmp = new Uint8Array(4);
      await Deno.stdin.read(tmp);
      Deno.stdin.setRaw(false);
      console.log();
    }
  }

  await runShowcase(chosen);
}

async function runShowcase(chosen: ShowcaseFile): Promise<void> {
  currentKey = chosen.key;
  lastOut = "";
  __resetRng();
  if (!_loaded) {
    for (const f of ["data/ursamu.db", "data/ursamu.db-shm", "data/ursamu.db-wal"]) {
      try { await Deno.remove(join(Deno.cwd(), f)); } catch { /* missing */ }
    }
  }
  const player = buildMockPlayer(chosen.vars?.player ?? "Showcase Player");
  const admin  = buildMockPlayer("Admin", ["admin", "wizard"]);
  const vars   = chosen.vars ?? {};

  // Apply character setup
  if (chosen.setup?.character) {
    const ch = chosen.setup.character;
    if (ch.flags) for (const f of ch.flags) player.flags.add(f);
    if (ch.data)  Object.assign(player.data ??= {}, ch.data);
    if (ch.state) Object.assign(player.state, ch.state);

    // Seed to DBO chars collection
    const { chars } = await import("../schema.ts");
    const existingChar = await chars.findOne({ playerId: player.id });
    if (!existingChar) {
      const stats = ch.state?.mekton?.stats ?? {
        att: 5, bod: 5, cl: 5, emp: 5, int: 5, luck: 5, ma: 5, ref: 5, tech: 5, edu: 5
      };
      await chars.create({
        id: "char-" + player.id,
        playerId: player.id,
        playerName: player.name ?? "Unknown",
        stats,
        skills: ch.state?.mekton?.skills ?? {},
        lifepath: ch.state?.mekton?.lifepath ?? {
          socialStatus: 1, startingCash: 1000, parentStatus: "normal", familyStanding: "good",
          siblings: [], friends: [], enemies: [], romance: null,
          appearance: { hairColor: "brown", hairStyle: "short", eyeColor: "blue", personalityTrait: "friendly", valueMost: "family", valuedPossession: "ring", valuedPerson: "friend" },
          professionalEvents: []
        },
        charType: ch.state?.mekton?.charType ?? "rookie",
        rookieTemplate: ch.state?.mekton?.rookieTemplate ?? null,
        careers: ch.state?.mekton?.careers ?? [],
        age: ch.state?.mekton?.age ?? 18,
        equipment: ch.state?.mekton?.equipment ?? [],
        cash: ch.state?.mekton?.cash ?? 1000,
        statMethod: ch.state?.mekton?.statMethod ?? "concept",
        statPointPool: ch.state?.mekton?.statPointPool ?? 0,
        chargenStatus: ch.state?.mekton?.chargenStatus ?? "approved",
        wounds: ch.state?.mekton?.wounds ?? { head: 0, torso: 0, rArm: 0, lArm: 0, rLeg: 0, lLeg: 0 },
        stunned: ch.state?.mekton?.stunned ?? false,
        luckRemaining: ch.state?.mekton?.luckRemaining ?? stats.luck ?? 5,
        firstAidApplied: ch.state?.mekton?.firstAidApplied ?? {},
      });
    }
    if (ch.carrying) {
      for (const itemName of ch.carrying) {
        player.contents.push({
          id: "carried-" + itemName.toLowerCase().replace(/\s+/g, "-"),
          name: itemName,
          flags: new Set<string>(),
          state: { name: itemName },
          contents: [],
        } as IDBObj);
      }
    }
  }

  // Seed named targets
  const targets = new Map<string, IDBObj>();
  if (chosen.setup?.targets) {
    const { chars } = await import("../schema.ts");
    for (const [name, t] of Object.entries(chosen.setup.targets)) {
      const wantsPlayer = (t.flags ?? []).includes("player") || !t.flags;
      const tp = wantsPlayer
        ? buildMockPlayer(name, t.flags ?? [])
        : {
            id: "mock-" + name.toLowerCase().replace(/\s+/g, "-"),
            name,
            flags: new Set<string>(t.flags ?? []),
            state: { name },
            contents: [],
            data: { name },
            location: "mock-room",
          } as IDBObj;
      if (t.data)  Object.assign(tp.data ??= {}, t.data);
      if (t.state) Object.assign(tp.state, t.state);
      if (t.location) tp.location = t.location;
      targets.set(name, tp);

      if (wantsPlayer) {
        const existingTargetChar = await chars.findOne({ playerId: tp.id });
        if (!existingTargetChar) {
          const stats = t.state?.mekton?.stats ?? {
            att: 5, bod: 5, cl: 5, emp: 5, int: 5, luck: 5, ma: 5, ref: 5, tech: 5, edu: 5
          };
          await chars.create({
            id: "char-" + tp.id,
            playerId: tp.id,
            playerName: tp.name ?? name,
            stats,
            skills: t.state?.mekton?.skills ?? {},
            lifepath: t.state?.mekton?.lifepath ?? {
              socialStatus: 1, startingCash: 1000, parentStatus: "normal", familyStanding: "good",
              siblings: [], friends: [], enemies: [], romance: null,
              appearance: { hairColor: "brown", hairStyle: "short", eyeColor: "blue", personalityTrait: "friendly", valueMost: "family", valuedPossession: "ring", valuedPerson: "friend" },
              professionalEvents: []
            },
            charType: t.state?.mekton?.charType ?? "rookie",
            rookieTemplate: t.state?.mekton?.rookieTemplate ?? null,
            careers: t.state?.mekton?.careers ?? [],
            age: t.state?.mekton?.age ?? 18,
            equipment: t.state?.mekton?.equipment ?? [],
            cash: t.state?.mekton?.cash ?? 1000,
            statMethod: t.state?.mekton?.statMethod ?? "concept",
            statPointPool: t.state?.mekton?.statPointPool ?? 0,
            chargenStatus: t.state?.mekton?.chargenStatus ?? "approved",
            wounds: t.state?.mekton?.wounds ?? { head: 0, torso: 0, rArm: 0, lArm: 0, rLeg: 0, lLeg: 0 },
            stunned: t.state?.mekton?.stunned ?? false,
            luckRemaining: t.state?.mekton?.luckRemaining ?? stats.luck ?? 5,
            firstAidApplied: t.state?.mekton?.firstAidApplied ?? {},
          });
        }
      }
    }
  }

  // Populate parent contents arrays based on object locations
  const objs = [player, admin, ...targets.values()];
  for (const o of objs) {
    if (o.location) {
      const parent = objs.find((p) => p.id === o.location);
      if (parent) {
        parent.contents ??= [];
        if (!parent.contents.includes(o)) {
          parent.contents.push(o);
        }
      }
    }
  }

  const state: RunState = { player, admin, targets, setup: chosen.setup, dynamic: [] };

  console.log("\n" + BOLD + "=".repeat(70) + RESET);
  console.log(BOLD + "  " + showcaseLabel(chosen) + RESET);
  console.log(BOLD + "=".repeat(70) + RESET);
  for (const step of chosen.steps) await renderStep(step, vars, state);
  console.log("\n" + DIM + "-".repeat(70) + RESET + "\n");
}

await main();
Deno.exit(0);
