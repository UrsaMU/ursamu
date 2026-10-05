#!/usr/bin/env -S deno run -A --unstable-kv
// Showcase runner — Sprawl Goons commands in-process.
// Usage: deno task showcase [key] [--list] [--all]
import { parse } from "@std/flags";
import { expandGlob } from "@std/fs";
import { join } from "@std/path";

// Deterministic RNG so rolls are stable between runs.
let __rng = 0x12345678 >>> 0;
const RNG_SEED = 0x12345678 >>> 0;
export function __resetRng(): void {
  __rng = RNG_SEED;
}
Math.random = () => {
  __rng = (__rng * 1664525 + 1013904223) >>> 0;
  return __rng / 0x100000000;
};

// deno-lint-ignore no-explicit-any
type IDBObj = {
  id: string;
  name?: string;
  flags: Set<string>;
  // deno-lint-ignore no-explicit-any
  state: Record<string, any>;
  contents: unknown[];
  // deno-lint-ignore no-explicit-any
  data?: Record<string, any>;
  location?: string | null;
  [k: string]: unknown;
};
// deno-lint-ignore no-explicit-any
type IUrsamuSDK = any;

interface ShowcaseStep {
  sub?: string;
  note?: string;
  reset?: boolean;
  emit?: string;
  expect?: string;
  cmd?: string;
  as?: string;
  label?: string;
  connect?: string;
  disconnect?: string;
}
// deno-lint-ignore no-explicit-any
interface ShowcaseTarget {
  flags?: string[];
  // deno-lint-ignore no-explicit-any
  data?: Record<string, any>;
  // deno-lint-ignore no-explicit-any
  state?: Record<string, any>;
  location?: string;
}
interface ShowcaseSetup {
  // deno-lint-ignore no-explicit-any
  character?: Record<string, any>;
  targets?: Record<string, ShowcaseTarget>;
  room?: { name?: string; desc?: string; description?: string };
  /** Seed carried Things (state.sprawl_item). */
  // deno-lint-ignore no-explicit-any
  items?: Array<Record<string, any>>;
}
interface ShowcaseFile {
  key: string;
  label?: string;
  title?: string;
  description?: string;
  vars?: Record<string, string>;
  setup?: ShowcaseSetup;
  steps: ShowcaseStep[];
}
const showcaseLabel = (f: ShowcaseFile): string =>
  f.label ?? f.title ?? f.description ?? f.key;

// -- ANSI / MUSH -----------------------------------------------------------

const RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const CYAN = "\x1b[36m", GREEN = "\x1b[32m";
const MUSH: Record<string, string> = {
  "%ch": BOLD,
  "%cn": RESET,
  "%cr": "\x1b[31m",
  "%cg": "\x1b[32m",
  "%cb": "\x1b[34m",
  "%cy": "\x1b[33m",
  "%cw": "\x1b[37m",
  "%cc": "\x1b[36m",
  "%cm": "\x1b[35m",
  "%cx": "\x1b[90m",
  "%r": "\n",
  "%t": "\t",
};
const mush = (s: string) =>
  s.replace(/%c[a-z]|%[rtnb]/g, (m) => MUSH[m] ?? "");
// Strip ANSI so expect checks see "4/4" not "4\x1b[0m/\x1b[36m4".
// deno-lint-ignore no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const itrp = (s: string, v: Record<string, string>) =>
  s.replace(/{{(\w+)}}/g, (_, k) => v[k] ?? "{{" + k + "}}");

// -- Mock world ------------------------------------------------------------

function buildMockPlayer(name: string, flags: string[] = []): IDBObj {
  const id = "mock-" + name.toLowerCase().replace(/\s+/g, "-");
  return {
    id,
    name,
    flags: new Set(["connected", "player", ...flags]),
    state: { name },
    contents: [],
    data: { name },
    location: "mock-room",
  };
}

function applyPath(
  root: Record<string, unknown>,
  path: string,
  fn: (parent: Record<string, unknown>, leaf: string) => void,
): void {
  const segs = path.split(".");
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (cur[s] == null || typeof cur[s] !== "object") cur[s] = {};
    cur = cur[s] as Record<string, unknown>;
  }
  fn(cur, segs[segs.length - 1]);
}

function buildMockSDK(
  player: IDBObj,
  cmdName: string,
  args: (string | undefined)[],
  output: string[],
  world: IDBObj[],
  roomCfg?: ShowcaseSetup["room"],
  dynamic?: IDBObj[],
): IUrsamuSDK {
  const sid = "sid-" + player.id;
  const roomState: Record<string, unknown> = {};
  const desc = roomCfg?.description ?? roomCfg?.desc;
  if (desc) roomState.description = desc;

  const list = () =>
    dynamic ? [...world, ...dynamic] : world;

  const room = {
    id: "mock-room",
    name: roomCfg?.name ?? "Showcase Room",
    flags: new Set(["room"]),
    state: roomState,
    contents: list().filter((o) => o.location === "mock-room"),
    broadcast: (msg: string) => output.push(msg),
  };

  return {
    id: sid,
    me: player,
    socket: { id: sid, cid: player.id },
    cmd: { name: cmdName, original: "", args: args as string[] },
    here: room,
    send(msg: string, _to?: string) {
      output.push(msg);
    },
    broadcast: (msg: string) => {
      output.push(msg);
    },
    ui: { layout: () => {}, panel: (p: unknown) => p },
    util: {
      // deno-lint-ignore no-control-regex
      stripSubs: (s: string) =>
        s.replace(/\x1b\[[^m]*m/g, "").replace(/%c[a-z]/gi, ""),
      target: (_a: IDBObj, q: string) => {
        const lc = q.toLowerCase().trim();
        const pool = list();
        const score = (o: IDBObj): number => {
          const nm = (o.name ?? "").toLowerCase();
          const slug = String(
            (o.state as { sprawl_item?: { slug?: string } })
              ?.sprawl_item?.slug ?? "",
          ).toLowerCase();
          if (o.id === q || o.id === lc) return 100;
          if (nm === lc || slug === lc) return 90;
          if (nm.startsWith(lc) || slug.startsWith(lc)) return 80;
          if (nm.includes(lc) || slug.includes(lc)) return 50;
          if (nm.split(";").includes(lc)) return 70;
          return 0;
        };
        let best: IDBObj | undefined;
        let bestN = 0;
        for (const o of pool) {
          const n = score(o);
          if (n > bestN) {
            bestN = n;
            best = o;
          }
        }
        return Promise.resolve(bestN > 0 ? best : undefined);
      },
      displayName: (o: IDBObj) => o.name ?? o.id,
      ljust: (s: string, w: number, fill = " ") => {
        const plain = s.replace(/%c[a-zA-Z]/g, "").replace(
          /%[nrtbR]/g,
          "",
        );
        const pad = w - plain.length;
        return pad > 0 ? s + fill.repeat(pad) : s;
      },
      rjust: (s: string, w: number, fill = " ") => {
        const plain = s.replace(/%c[a-zA-Z]/g, "").replace(
          /%[nrtbR]/g,
          "",
        );
        const pad = w - plain.length;
        return pad > 0 ? fill.repeat(pad) + s : s;
      },
      center: (s: string, w: number, fill = " ") => {
        const plain = s.replace(/%c[a-zA-Z]/g, "").replace(
          /%[nrtbR]/g,
          "",
        );
        const pad = w - plain.length;
        if (pad <= 0) return s;
        const left = Math.floor(pad / 2);
        return fill.repeat(left) + s + fill.repeat(pad - left);
      },
      header: (string = "", filler = "=", width = 78) => {
        if (!string) return filler.repeat(width);
        const titleText = `[ ${string} ]`;
        const plain = titleText.replace(/%c[a-zA-Z]/g, "");
        const pad = width - plain.length;
        const left = Math.floor(pad / 2);
        return (
          filler.repeat(Math.max(0, left)) + titleText +
          filler.repeat(Math.max(0, pad - left))
        );
      },
      divider: (string = "", filler = "-", width = 78) => {
        if (!string) return filler.repeat(width);
        return filler.repeat(width);
      },
      footer: (string = "", filler = "=", width = 78) =>
        filler.repeat(width),
    },
    db: {
      search: (q: unknown) => {
        const pool = list();
        if (typeof q === "string") {
          const lc = q.toLowerCase();
          return Promise.resolve(
            pool.filter((o) =>
              o.id.toLowerCase() === lc ||
              o.name?.toLowerCase().includes(lc)
            ),
          );
        }
        const shim = q as Record<string, unknown>;
        return Promise.resolve(pool.filter((o) => {
          for (const [k, v] of Object.entries(shim)) {
            const cur = (o as Record<string, unknown>)[k];
            if (v instanceof RegExp) {
              const hs = cur instanceof Set
                ? [...cur].join(",")
                : String(cur ?? "");
              if (!v.test(hs)) return false;
            } else if (cur !== v) return false;
          }
          return true;
        }));
      },
      queryOne: (q: Record<string, unknown>) =>
        Promise.resolve(
          list().find((o) =>
            Object.entries(q).every(([k, v]) =>
              (o as Record<string, unknown>)[k] === v
            )
          ),
        ),
      get: (id: string) =>
        Promise.resolve(list().find((o) => o.id === id) ?? null),
      modify: (id: string, op: string, data: Record<string, unknown>) => {
        const obj = list().find((o) => o.id === id);
        if (!obj) return Promise.resolve();
        const root = obj as unknown as Record<string, unknown>;
        for (const [path, value] of Object.entries(data)) {
          if (op === "$set") {
            applyPath(root, path, (p, k) => {
              p[k] = value;
            });
            // Mirror data.sprawl_item → state.sprawl_item
            if (path.startsWith("data.")) {
              const stPath = "state." + path.slice(5);
              applyPath(root, stPath, (p, k) => {
                p[k] = value;
              });
            }
          } else if (op === "$unset") {
            applyPath(root, path, (p, k) => {
              delete p[k];
            });
          } else if (op === "$inc") {
            applyPath(root, path, (p, k) => {
              p[k] = ((p[k] as number) ?? 0) + (value as number);
            });
          }
        }
        return Promise.resolve();
      },
      create: (template: Partial<IDBObj>) => {
        const obj: IDBObj = {
          id: `obj-${list().length + 1}-${Date.now()}`,
          name: "",
          flags: new Set<string>(),
          location: null,
          contents: [],
          state: {},
          ...template,
        } as IDBObj;
        if (dynamic) dynamic.push(obj);
        else world.push(obj);
        return Promise.resolve(obj);
      },
      destroy: (id: string) => {
        if (dynamic) {
          const di = dynamic.findIndex((o) => o.id === id);
          if (di >= 0) dynamic.splice(di, 1);
        }
        const idx = world.findIndex((o) => o.id === id);
        if (idx >= 0) world.splice(idx, 1);
        return Promise.resolve();
      },
    },
    canEdit: () => Promise.resolve(true),
    setFlags: (target: string | IDBObj, flags: string) => {
      const id = typeof target === "string" ? target : target.id;
      const obj = list().find((o) => o.id === id);
      if (!obj) return Promise.resolve();
      obj.flags ??= new Set<string>();
      for (const tok of flags.split(/\s+/).filter(Boolean)) {
        if (tok.startsWith("!")) obj.flags.delete(tok.slice(1));
        else obj.flags.add(tok);
      }
      return Promise.resolve();
    },
    sys: { uptime: () => Promise.resolve(3725) },
    eval: async () => "",
    attr: {
      get: async () => null,
      set: async () => {},
      clear: async () => false,
    },
  } as unknown as IUrsamuSDK;
}
// -- Bootstrap -------------------------------------------------------------

let _loaded = false;
let _allObjs: IDBObj[] = [];

async function ensureLoaded(objs: IDBObj[]) {
  const shim = await import("./ursamu-shim.ts");
  if (!_loaded) {
    _loaded = true;
    await import("../commands.ts");
    // Real player verbs used in showcases
    await import("./showcase-builtins.ts");
    const { initObjectUseHooks } = await import(
      "../integrations/object-use.ts"
    );
    const { initInventoryHooks } = await import(
      "../integrations/inventory.ts"
    );
    const { initLookHooks } = await import(
      "../integrations/look.ts"
    );
    initObjectUseHooks();
    initInventoryHooks();
    initLookHooks();
  }
  _allObjs = objs;
  shim.__shimSeed(_allObjs);
}

async function execCmd(
  raw: string,
  actor: IDBObj,
  world: IDBObj[],
  roomCfg?: ShowcaseSetup["room"],
  dynamic?: IDBObj[],
): Promise<string[]> {
  const pool = dynamic ? [...world, ...dynamic] : world;
  await ensureLoaded(pool);
  const shim = await import("./ursamu-shim.ts");
  const output: string[] = [];
  shim.__shimSetSendSink((_sids, msg) => {
    output.push(msg);
  });
  try {
    for (const cmd of shim.cmds) {
      const m = raw.trim().match(cmd.pattern);
      if (!m) continue;
      const u = buildMockSDK(
        actor,
        cmd.name,
        m.slice(1),
        output,
        world,
        roomCfg,
        dynamic,
      );
      try {
        await cmd.exec(u);
      } catch (e) {
        output.push(
          "%ch%cr>> exec error: " + (e as Error).message + "%cn",
        );
      }
      return output;
    }
    output.push("%cw>> no command matched: " + raw + "%cn");
    return output;
  } finally {
    shim.__shimSetSendSink(null);
  }
}
// -- Rendering -------------------------------------------------------------

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
  for (const t of state.targets.values()) {
    if (t.name?.toLowerCase() === lc) return t;
  }
  return undefined;
}

function worldOf(state: RunState): IDBObj[] {
  return [state.player, state.admin, ...state.targets.values()];
}

function allObjs(state: RunState): IDBObj[] {
  return [...worldOf(state), ...state.dynamic];
}
const VERIFY = true;
const failures: {
  key: string;
  step: string;
  expect: string;
  actual: string;
}[] = [];
let currentKey = "";
let lastOut = "";

async function renderStep(
  step: ShowcaseStep,
  vars: Record<string, string>,
  state: RunState,
): Promise<void> {
  if (step.sub != null) {
    console.log(
      "\n" + DIM + "-- " + step.sub + " " +
        "-".repeat(Math.max(0, 66 - step.sub.length)) + RESET,
    );
    return;
  }
  if (step.note != null) {
    console.log("  " + DIM + itrp(step.note, vars) + RESET);
    return;
  }
  if (step.reset) {
    state.dynamic.length = 0;
    lastOut = "";
    console.log("  " + DIM + "[state reset]" + RESET);
    return;
  }
  if (step.disconnect != null) {
    const o = findByName(state, step.disconnect);
    if (o) o.flags.delete("connected");
    console.log(
      "  " + DIM + "[" + step.disconnect + " disconnected]" + RESET,
    );
    return;
  }
  if (step.connect != null) {
    const o = findByName(state, step.connect);
    if (o) o.flags.add("connected");
    console.log(
      "  " + DIM + "[" + step.connect + " connected]" + RESET,
    );
    return;
  }
  if (step.emit != null) {
    console.log(
      "  " + BOLD + "emit " + RESET + mush(itrp(step.emit, vars)) +
        (step.label ? "  " + DIM + "# " + step.label + RESET : ""),
    );
    return;
  }
  if (step.expect != null) {
    const want = itrp(step.expect, vars);
    const hay = stripAnsi(lastOut).toLowerCase();
    // "!foo" = must NOT appear (e.g. boarded pilot in room look)
    const neg = want.startsWith("!");
    const needle = (neg ? want.slice(1) : want).toLowerCase();
    const hit = hay.includes(needle);
    const ok = neg ? !hit : hit;
    const tag = VERIFY ? (ok ? " [OK]" : " [FAIL]") : "";
    console.log(
      "  " + DIM + "expect -> " + want + RESET + tag,
    );
    if (VERIFY && !ok) {
      failures.push({
        key: currentKey,
        step: "expect",
        expect: want,
        actual: stripAnsi(lastOut).slice(0, 240),
      });
    }
    return;
  }
  if (step.cmd != null) {
    const raw = itrp(step.cmd, vars);
    const actor = actorFor(step, state);
    const roleNt = step.as
      ? "  " + DIM + "[as: " + step.as + "]" + RESET
      : "";
    const lbl = step.label
      ? "  " + DIM + "# " + step.label + RESET
      : "";
    console.log(
      "  " + BOLD + "> " + raw.split("\n")[0] +
        (raw.includes("\n") ? " ..." : "") + RESET + roleNt + lbl,
    );
    const lines = await execCmd(
      raw,
      actor,
      worldOf(state),
      state.setup?.room,
      state.dynamic,
    );
    const plain: string[] = [];
    for (const line of lines) {
      const m = mush(line);
      for (const r of m.split("\n")) {
        if (r.trim()) console.log("     " + r);
        plain.push(r);
      }
    }
    lastOut = plain.join("\n");
    if (VERIFY && /exec error/i.test(lastOut)) {
      failures.push({
        key: currentKey,
        step: raw,
        expect: "(no exec error)",
        actual: lastOut.slice(0, 240),
      });
    }
  }
}

// -- Character seed (state.sprawl) ------------------------------------------

function seedSprawl(
  player: IDBObj,
  // deno-lint-ignore no-explicit-any
  charData: Record<string, any> | undefined,
): void {
  if (!charData) return;
  // setup.character is the sprawl sheet itself (or nested under .sprawl)
  const sheet = charData.sprawl ?? charData;
  player.state = {
    ...player.state,
    sprawl: structuredClone(sheet),
  };
}

// -- CLI -------------------------------------------------------------------

async function pickInteractive(
  files: ShowcaseFile[],
): Promise<ShowcaseFile | null> {
  const sorted = [...files].sort((a, b) => a.key.localeCompare(b.key));
  let idx = 0;
  const enc = new TextEncoder();
  const write = (s: string) => Deno.stdout.writeSync(enc.encode(s));
  const hideCursor = () => write("\x1b[?25l");
  const showCursor = () => write("\x1b[?25h");
  const draw = (first: boolean) => {
    const lines = sorted.length + 3;
    if (!first) write(`\x1b[${lines}A\x1b[0J`);
    console.log(
      BOLD + CYAN + "  Sprawl Goons Showcases" + RESET + DIM +
        "  -- up/down  Enter  q quit" + RESET,
    );
    console.log(DIM + "  " + "-".repeat(60) + RESET);
    for (let i = 0; i < sorted.length; i++) {
      const sel = i === idx;
      console.log(
        (sel ? GREEN + "  > " + BOLD : "    " + DIM) +
          showcaseLabel(sorted[i]) + RESET,
      );
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
      if (b[0] === 13) return sorted[idx];
      if (b[0] === 113 || b[0] === 3 || (b[0] === 27 && n === 1)) {
        return null;
      }
      if (b[0] === 27 && b[1] === 91 && b[2] === 65) {
        idx = (idx - 1 + sorted.length) % sorted.length;
        draw(false);
        continue;
      }
      if (b[0] === 27 && b[1] === 91 && b[2] === 66) {
        idx = (idx + 1) % sorted.length;
        draw(false);
        continue;
      }
    }
  } finally {
    Deno.stdin.setRaw(false);
    showCursor();
  }
  return null;
}

async function runShowcase(chosen: ShowcaseFile): Promise<void> {
  currentKey = chosen.key;
  lastOut = "";
  __resetRng();

  const player = buildMockPlayer(chosen.vars?.player ?? "Neon");
  const admin = buildMockPlayer("Admin", ["admin", "wizard"]);
  const vars = chosen.vars ?? {};

  seedSprawl(player, chosen.setup?.character);

  const targets = new Map<string, IDBObj>();  if (chosen.setup?.targets) {
    for (const [name, t] of Object.entries(chosen.setup.targets)) {
      const wantsPlayer = (t.flags ?? []).includes("player") ||
        !t.flags ||
        (t.flags ?? []).length === 0;
      const tp = wantsPlayer
        ? buildMockPlayer(name, t.flags ?? [])
        : {
          id: "mock-" + name.toLowerCase().replace(/\s+/g, "-"),
          name,
          flags: new Set<string>(t.flags ?? []),
          state: { name },
          contents: [],
          data: { name },
          location: t.location ?? "mock-room",
        } as IDBObj;
      if (t.data) Object.assign(tp.data ??= {}, t.data);
      if (t.state) {
        // Prefer state.sprawl sheet on targets
        if (t.state.sprawl) {
          tp.state = { ...tp.state, sprawl: structuredClone(t.state.sprawl) };
        } else if (
          t.state.chargenStatus != null || t.state.stats != null
        ) {
          tp.state = {
            ...tp.state,
            sprawl: structuredClone(t.state),
          };
        } else {
          Object.assign(tp.state, t.state);
        }
      }
      if (t.location) tp.location = t.location;
      targets.set(name, tp);
    }
  }

  const state: RunState = {
    player,
    admin,
    targets,
    setup: chosen.setup,
    dynamic: [],
  };

  if (chosen.setup?.items?.length) {
    await ensureLoaded(allObjs(state));
    const { createItem } = await import("../engine/items.ts");
    const seedU = buildMockSDK(
      player,
      "seed",
      [],
      [],
      worldOf(state),
      chosen.setup.room,
      state.dynamic,
    );
    for (const src of chosen.setup.items) {
      await createItem(seedU, player.id, src, {
        name: src.name ? String(src.name) : undefined,
      });
    }
  }

  console.log("\n" + BOLD + "=".repeat(70) + RESET);
  console.log(BOLD + "  " + showcaseLabel(chosen) + RESET);
  console.log(BOLD + "=".repeat(70) + RESET);
  for (const step of chosen.steps) {
    await renderStep(step, vars, state);
  }
  console.log("\n" + DIM + "-".repeat(70) + RESET + "\n");
}

async function main(): Promise<void> {
  const args = parse(Deno.args, {
    boolean: ["list", "help", "all"],
    alias: { h: "help", l: "list", a: "all" },
  });
  if (args.help) {
    console.log(
      "Usage: deno task showcase [key] [--list] [--all]\n" +
        "  --list  List all showcases\n" +
        "  --all   Run every showcase\n" +
        "  --help  Show help",
    );
    return;
  }

  const files: ShowcaseFile[] = [];
  for await (
    const e of expandGlob(join(Deno.cwd(), "showcases", "*.json"))
  ) {
    try {
      files.push(
        JSON.parse(await Deno.readTextFile(e.path)) as ShowcaseFile,
      );
    } catch { /* skip */ }
  }
  if (files.length === 0) {
    console.log("No showcase files found in showcases/");
    return;
  }

  if (args.all) {
    const sorted = [...files].sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    for (const f of sorted) await runShowcase(f);
    if (VERIFY) {
      console.log(
        "\n" + BOLD + "=== SHOWCASE VERIFY SUMMARY ===" + RESET,
      );
      console.log(
        "Total showcases: " + sorted.length +
          "  Failures: " + failures.length,
      );
      for (const f of failures) {
        console.log("\n[" + f.key + "] step=" + f.step);
        console.log("  expect: " + f.expect);
        console.log(
          "  actual: " + f.actual.replace(/\n/g, " | "),
        );
      }
      if (failures.length > 0) Deno.exit(1);
    }
    return;
  }

  if (args.list) {
    console.log("\nAvailable showcases:\n");
    for (const f of files) {
      console.log(
        "  " + BOLD + f.key + RESET + "  " + DIM +
          showcaseLabel(f) + RESET,
      );
    }
    return;
  }

  const key = args._[0]?.toString();
  const chosen: ShowcaseFile | null = key
    ? (files.find((f) => f.key === key) ?? null)
    : null;
  if (key && !chosen) {
    console.error(
      "Showcase '" + key + "' not found. Run --list to see keys.",
    );
    return;
  }

  if (!chosen) {
    while (true) {
      const picked = await pickInteractive(files);
      if (!picked) {
        console.log("\n" + DIM + "Cancelled." + RESET);
        return;
      }
      await runShowcase(picked);
      console.log(
        DIM + "  Press any key to return to menu..." + RESET,
      );
      Deno.stdin.setRaw(true);
      const tmp = new Uint8Array(4);
      await Deno.stdin.read(tmp);
      Deno.stdin.setRaw(false);
      console.log();
    }
  }

  await runShowcase(chosen);
}

await main();
Deno.exit(0);
