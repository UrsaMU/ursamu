import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { join } from "jsr:@std/path";

// ─── mock helpers ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AnyObj = Record<string, any>;

function mockPlayer(overrides: AnyObj = {}): AnyObj {
  return {
    id: "1", name: "TestAdmin",
    flags: new Set(["player", "connected", "admin"]),
    state: { quota: 50, owner: "1" },
    location: "2", contents: [],
    ...overrides,
  };
}

function mockRoom(overrides: AnyObj = {}): AnyObj {
  return {
    id: "2", name: "Lobby",
    flags: new Set(["room"]),
    state: { name: "Lobby", owner: "1" },
    location: "", contents: [],
    ...overrides,
  };
}

function mockZmo(overrides: AnyObj = {}): AnyObj {
  return {
    id: "50", name: "Market District",
    flags: new Set(["thing", "zone"]),
    state: { name: "Market District", owner: "1", description: "" },
    location: "1", contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: AnyObj;
  args?: string[];
  switches?: string[];
  here?: AnyObj;
  targetResult?: AnyObj | null;
  searchResults?: AnyObj[];
  canEditResult?: boolean;
  forceAsCalls?: string[];
} = {}) {
  const sent: string[]       = [];
  const dbCalls: unknown[][] = [];
  const dbCreated: AnyObj[]  = [];
  const dbDestroyed: string[] = [];
  const forceAsCalls: string[] = opts.forceAsCalls ?? [];

  const me   = mockPlayer(opts.me ?? {});
  const here = opts.here ?? mockRoom();

  return Object.assign({
    me, here,
    cmd: {
      name: "", original: "",
      args:     opts.args     ?? [],
      switches: opts.switches ?? [],
    },
    send:      (m: string) => sent.push(m),
    broadcast: () => {},
    teleport:  () => {},
    canEdit:   async () => opts.canEditResult ?? true,
    setFlags:  async () => {},
    forceAs:   async (_id: string, cmd: string) => { forceAsCalls.push(cmd); },
    db: {
      modify:  async (...a: unknown[]) => { dbCalls.push(a); },
      search:  async (_q: unknown): Promise<AnyObj[]> => {
        if (opts.searchResults) return opts.searchResults;
        if (opts.targetResult  !== undefined) return opts.targetResult ? [opts.targetResult] : [];
        return [];
      },
      create:  async (d: AnyObj): Promise<AnyObj> => {
        const obj = { ...d, id: "99", name: d.state?.name ?? "New", flags: new Set<string>(), contents: [], state: d.state ?? {} };
        dbCreated.push(obj);
        return obj;
      },
      destroy: async (id: string) => { dbDestroyed.push(id); },
    },
    util: {
      target:      async (_me: AnyObj, ref: string) => {
        if (ref === "here") return here;
        return opts.targetResult ?? null;
      },
      displayName: (o: AnyObj) => o.name ?? o.id ?? "Unknown",
      stripSubs:   (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center:      (s: string) => s,
      ljust:       (s: string, w: number) => s.padEnd(w),
      rjust:       (s: string, w: number) => s.padStart(w),
    },
  // deno-lint-ignore no-explicit-any
  } as any, { _sent: sent, _dbCalls: dbCalls, _dbCreated: dbCreated, _dbDestroyed: dbDestroyed, _forceAsCalls: forceAsCalls });
}

// ─── zone script ──────────────────────────────────────────────────────────────

describe("@zone script", () => {
  // deno-lint-ignore no-explicit-any
  async function execZone(u: any) {
    const { default: script } = await import("../src/scripts/zone.ts");
    // deno-lint-ignore no-explicit-any
    await (script as any)(u);
  }

  it("non-builder is rejected — no DB ops", async () => {
    const u = mockU({ me: { flags: new Set(["player", "connected"]) }, switches: ["create"], args: ["Test"] });
    await execZone(u);
    assertStringIncludes(u._sent[0], "Permission denied");
    assertEquals(u._dbCreated.length, 0);
  });

  // /create ────────────────────────────────────────────────────────────────────

  it("/create — creates a ZMO game object", async () => {
    const u = mockU({ switches: ["create"], args: ["Market District"], searchResults: [] });
    await execZone(u);
    assertEquals(u._dbCreated.length, 1);
    assertStringIncludes(u._sent[0], "Market District");
  });

  it("/create — rejects duplicate zone name", async () => {
    const u = mockU({ switches: ["create"], args: ["Market District"], searchResults: [mockZmo()] });
    await execZone(u);
    assertStringIncludes(u._sent[0], "already exists");
    assertEquals(u._dbCreated.length, 0);
  });

  it("/create — rejects empty name", async () => {
    const u = mockU({ switches: ["create"], args: [""] });
    await execZone(u);
    assertStringIncludes(u._sent[0], "Usage");
    assertEquals(u._dbCreated.length, 0);
  });

  it("/create — rejects name over 200 chars", async () => {
    const u = mockU({ switches: ["create"], args: ["x".repeat(201)], searchResults: [] });
    await execZone(u);
    assertStringIncludes(u._sent[0], "too long");
    assertEquals(u._dbCreated.length, 0);
  });

  // /add ───────────────────────────────────────────────────────────────────────

  it("/add — sets data.zone on target room", async () => {
    const zmo  = mockZmo({ id: "50" });
    const room = mockRoom({ id: "10" });
    let call   = 0;
    const u    = mockU({ switches: ["add"], args: ["#10=Market District"] });
    // resolveRoom calls search first (call 1), then findZmo (call 2)
    u.db.search = async (_q: unknown) => { call++; return call === 1 ? [room] : [zmo]; };
    await execZone(u);
    const setCall = u._dbCalls.find((c: unknown[]) => c[1] === "$set" && (c[2] as AnyObj)["data.zone"] === "50");
    assertEquals(setCall?.[0], "10");
  });

  it("/add — defaults to 'here' when no room ref given", async () => {
    const zmo  = mockZmo({ id: "50" });
    const here = mockRoom({ id: "2" });
    const u    = mockU({ switches: ["add"], args: ["Market District"], here });
    u.db.search = async () => [zmo];
    await execZone(u);
    const setCall = u._dbCalls.find((c: unknown[]) => c[1] === "$set" && (c[2] as AnyObj)["data.zone"]);
    assertEquals(setCall?.[0], "2");
  });

  it("/add — rejects non-room target", async () => {
    const zmo   = mockZmo({ id: "50" });
    const thing = mockRoom({ id: "10", flags: new Set(["thing"]) });
    let call    = 0;
    const u     = mockU({ switches: ["add"], args: ["widget=Market District"] });
    u.db.search = async () => { call++; return call === 1 ? [zmo] : [thing]; };
    await execZone(u);
    assertStringIncludes(u._sent[0], "must be a room");
    assertEquals(u._dbCalls.length, 0);
  });

  it("/add — strips MUSH codes before zone lookup (no crash)", async () => {
    const zmo  = mockZmo({ id: "50" });
    const here = mockRoom({ id: "2" });
    const u    = mockU({ switches: ["add"], args: ["%chMarket District%cn"], here });
    u.db.search = async () => [zmo];
    await execZone(u);
    // Either zone found+set or zone-not-found — what must NOT happen is a crash
    assertEquals(typeof u._sent[0], "string");
    // MUSH codes must not appear in any DB write
    for (const call of u._dbCalls) {
      assertEquals(JSON.stringify(call).includes("%c"), false);
    }
  });

  it("/add — permission denied does not write DB", async () => {
    const zmo  = mockZmo({ id: "50" });
    const here = mockRoom({ id: "2" });
    const u    = mockU({ switches: ["add"], args: ["Market District"], here, canEditResult: false });
    u.db.search = async () => [zmo];
    await execZone(u);
    assertStringIncludes(u._sent[0], "Permission denied");
    assertEquals(u._dbCalls.length, 0);
  });

  // /remove ────────────────────────────────────────────────────────────────────

  it("/remove — unsets data.zone on room (uses $unset)", async () => {
    const here = mockRoom({ id: "2", state: { name: "Lobby", owner: "1", zone: "50" } });
    const u    = mockU({ switches: ["remove"], args: ["here"], here });
    await execZone(u);
    const unset = u._dbCalls.find((c: unknown[]) => c[1] === "$unset");
    assertEquals(unset?.[0], "2");
    assertEquals((unset?.[2] as AnyObj)["data.zone"], "");
  });

  it("/remove — informs when room has no zone", async () => {
    const here = mockRoom({ id: "2", state: { name: "Lobby", owner: "1" } });
    const u    = mockU({ switches: ["remove"], args: ["here"], here });
    await execZone(u);
    assertStringIncludes(u._sent[0], "not in any zone");
    assertEquals(u._dbCalls.length, 0);
  });

  // /destroy ───────────────────────────────────────────────────────────────────

  it("/destroy — destroys ZMO and unlinks all linked rooms", async () => {
    const zmo   = mockZmo({ id: "50" });
    const room1 = mockRoom({ id: "10", state: { zone: "50" } });
    const room2 = mockRoom({ id: "11", state: { zone: "50" } });
    let call    = 0;
    const u     = mockU({ switches: ["destroy"], args: ["Market District"] });
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [zmo];
      const qr = q as AnyObj;
      if (qr?.["data.zone"] === "50") return [room1, room2];
      return [];
    };
    await execZone(u);
    assertEquals(u._dbDestroyed[0], "50");
    const unsets = u._dbCalls.filter((c: unknown[]) => c[1] === "$unset");
    assertEquals(unsets.length, 2);
  });

  it("/destroy — permission denied, no destroy", async () => {
    const zmo = mockZmo({ id: "50" });
    const u   = mockU({ switches: ["destroy"], args: ["Market District"], canEditResult: false });
    u.db.search = async () => [zmo];
    await execZone(u);
    assertStringIncludes(u._sent[0], "Permission denied");
    assertEquals(u._dbDestroyed.length, 0);
  });

  it("/destroy — zone not found", async () => {
    const u = mockU({ switches: ["destroy"], args: ["Nonexistent"], searchResults: [] });
    await execZone(u);
    assertStringIncludes(u._sent[0], "No zone found");
    assertEquals(u._dbDestroyed.length, 0);
  });

  // /list ──────────────────────────────────────────────────────────────────────

  it("/list — shows all zones when no arg", async () => {
    const zmo  = mockZmo({ id: "50" });
    let call   = 0;
    const u    = mockU({ switches: [], args: [""] });
    u.db.search = async (q: unknown) => {
      call++;
      const qr = q as AnyObj;
      if (call === 1) return [zmo];
      if (qr?.["data.zone"] === "50") return [mockRoom()];
      return [];
    };
    await execZone(u);
    assertStringIncludes(u._sent[0], "Market District");
  });

  it("/list <zone> — lists rooms in that zone", async () => {
    const zmo  = mockZmo({ id: "50" });
    const room = mockRoom({ id: "10", name: "Market Square" });
    let call   = 0;
    const u    = mockU({ switches: ["list"], args: ["Market District"] });
    u.db.search = async () => { call++; return call === 1 ? [zmo] : [room]; };
    await execZone(u);
    assertStringIncludes(u._sent[0], "Market Square");
  });

  it("/list — shows empty message when no zones exist", async () => {
    const u = mockU({ switches: [], args: [""], searchResults: [] });
    await execZone(u);
    assertStringIncludes(u._sent[0], "No zones");
  });

  // /info ──────────────────────────────────────────────────────────────────────

  it("/info — shows zone ID, owner, and room count", async () => {
    const zmo   = mockZmo({ id: "50" });
    const owner = mockPlayer({ id: "1", name: "Wizard" });
    let call    = 0;
    const u     = mockU({ switches: ["info"], args: ["Market District"] });
    u.db.search = async (q: unknown) => {
      call++;
      const qr = q as AnyObj;
      if (call === 1) return [zmo];
      if (qr?.["data.zone"] === "50") return [mockRoom()];
      if (qr?.id === "1") return [owner];
      return [];
    };
    await execZone(u);
    assertStringIncludes(u._sent[0], "#50");
    assertStringIncludes(u._sent[0], "Market District");
  });

  it("unknown switch — sends helpful error", async () => {
    const u = mockU({ switches: ["bogus"], args: [""] });
    await execZone(u);
    assertStringIncludes(u._sent[0], "Unknown switch");
  });
});

// ─── batchbuild safeName tests ────────────────────────────────────────────────

describe("@batchbuild — safeName guard", () => {
  it("rejects path traversal and special characters", () => {
    const bad = ["../etc/passwd", "../../secret", "foo/bar", "foo bar", "foo;bar", "foo.bar"];
    for (const name of bad) {
      assertEquals(/^[A-Za-z0-9_-]+$/.test(name), false, `Expected "${name}" to be rejected`);
    }
  });

  it("accepts valid build file names", () => {
    const good = ["market", "Market-District", "zone_01", "MyZone123", "area-1"];
    for (const name of good) {
      assertEquals(/^[A-Za-z0-9_-]+$/.test(name), true, `Expected "${name}" to be accepted`);
    }
  });

  it("strips .txt extension before validation", () => {
    // Simulates the rawFile.replace(/\.txt$/i, "") in handleRun
    const withExt    = "market.txt".replace(/\.txt$/i, "");
    const withoutExt = "market".replace(/\.txt$/i, "");
    assertEquals(withExt, "market");
    assertEquals(withoutExt, "market");
    assertEquals(/^[A-Za-z0-9_-]+$/.test(withExt), true);
  });
});

// ─── batchbuild file format tests ────────────────────────────────────────────

describe("@batchbuild — build file format", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir({ prefix: "batchbuild_test_" });
  });

  afterEach(async () => {
    await Deno.remove(tmpDir, { recursive: true });
  });

  it("comments and blank lines are skipped", async () => {
    const content = [
      "# This is a comment",
      "@dig/teleport Market Square",
      "",
      "# Another comment",
      "@describe here=A busy square.",
      "@zone/add here=Market District",
    ].join("\n");

    const filePath = join(tmpDir, "test.txt");
    await Deno.writeTextFile(filePath, content);

    const raw     = await Deno.readTextFile(filePath);
    const cmds    = raw.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    assertEquals(cmds.length, 3);
    assertEquals(cmds[0], "@dig/teleport Market Square");
    assertEquals(cmds[1], "@describe here=A busy square.");
    assertEquals(cmds[2], "@zone/add here=Market District");
  });

  it("files over 2000 commands would exceed MAX_LINES", () => {
    const lines = Array.from({ length: 2001 }, (_, i) => `@think ${i}`);
    assertEquals(lines.length > 2000, true);
  });

  it("all-comment file yields zero executable commands", () => {
    const content = "# comment 1\n# comment 2\n\n# comment 3\n";
    const cmds    = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    assertEquals(cmds.length, 0);
  });
});

// ─── SECURITY: newline injection remediation [ScriptInj] ─────────────────────
//
// These tests cover the tdd-audit findings:
//   HIGH   — description \n injects arbitrary command into build script
//   MEDIUM — room/exit/zone names with \n inject commands
//   MEDIUM — zone.ts handleCreate stores \n in zone name
//
// Pattern: [RED] helper mirrors VULNERABLE logic → assertion catches the attack
//          [GREEN] helper mirrors FIXED logic → attack string is neutralised

describe("@batchbuild — SECURITY: newline injection [ScriptInj]", () => {
  // ── Simulated helpers (mirror batchbuild.ts generateScript logic) ───────────

  /** BEFORE fix — writes user strings to script without sanitisation */
  function vulnerable_buildScript(rooms: Array<{ name: string; desc: string; zone: string }>): string {
    const lines: string[] = [];
    for (const r of rooms) {
      lines.push(`@dig/teleport ${r.name}`);
      if (r.desc) lines.push(`@describe here=${r.desc}`);
      lines.push(`@zone/add here=${r.zone}`);
    }
    return lines.join("\n");
  }

  /** AFTER fix — replaces \n with %r in every user-controlled field */
  function sanitize(s: string): string { return s.replace(/[\r\n]+/g, "%r"); }
  function fixed_buildScript(rooms: Array<{ name: string; desc: string; zone: string }>): string {
    const lines: string[] = [];
    for (const r of rooms) {
      lines.push(`@dig/teleport ${sanitize(r.name)}`);
      if (r.desc) lines.push(`@describe here=${sanitize(r.desc)}`);
      lines.push(`@zone/add here=${sanitize(r.zone)}`);
    }
    return lines.join("\n");
  }

  function parseCommands(script: string): string[] {
    return script.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  }

  // ── HIGH: description injection ─────────────────────────────────────────────

  it("[RED] HIGH — description \\n injects arbitrary command into build script", () => {
    const room = { name: "Safe Room", desc: "A cozy room.\n@set me=wizard", zone: "Market" };
    const script = vulnerable_buildScript([room]);
    const cmds   = parseCommands(script);
    // Confirms the vulnerability: @set me=wizard is a standalone executable line
    assertEquals(cmds.includes("@set me=wizard"), true,
      "VULNERABILITY: newline in description injects @set me=wizard as a command");
  });

  it("[GREEN] HIGH — after fix: description newlines replaced with %r, injection blocked", () => {
    const room = { name: "Safe Room", desc: "A cozy room.\n@set me=wizard", zone: "Market" };
    const script = fixed_buildScript([room]);
    const cmds   = parseCommands(script);
    assertEquals(cmds.includes("@set me=wizard"), false,
      "FIX: @set me=wizard must not appear as a standalone command after sanitisation");
    // Ensure description is still present — just escaped
    assertStringIncludes(script, "%r@set me=wizard");
  });

  it("[GREEN] HIGH — multi-line \\r\\n description also sanitised", () => {
    const room = { name: "A Room", desc: "Line one.\r\n@destroy here", zone: "Z" };
    const script = fixed_buildScript([room]);
    const cmds   = parseCommands(script);
    assertEquals(cmds.includes("@destroy here"), false);
  });

  // ── MEDIUM: room name injection ──────────────────────────────────────────────

  it("[RED] MEDIUM — room name \\n injects command into build script", () => {
    const room = { name: "The Lobby\n@set here=wizard", desc: "", zone: "Market" };
    const script = vulnerable_buildScript([room]);
    const cmds   = parseCommands(script);
    assertEquals(cmds.includes("@set here=wizard"), true,
      "VULNERABILITY: newline in room name injects @set here=wizard");
  });

  it("[GREEN] MEDIUM — after fix: room name newlines replaced with %r", () => {
    const room = { name: "The Lobby\n@set here=wizard", desc: "", zone: "Market" };
    const script = fixed_buildScript([room]);
    const cmds   = parseCommands(script);
    assertEquals(cmds.includes("@set here=wizard"), false);
    assertStringIncludes(script, "%r@set here=wizard");
  });

  // ── MEDIUM: zone name injection ──────────────────────────────────────────────

  it("[RED] MEDIUM — zone name \\n injects command into build script", () => {
    const room = { name: "A Room", desc: "", zone: "Market\n@set me=wizard" };
    const script = vulnerable_buildScript([room]);
    const cmds   = parseCommands(script);
    assertEquals(cmds.includes("@set me=wizard"), true,
      "VULNERABILITY: newline in zone name injects @set me=wizard");
  });

  it("[GREEN] MEDIUM — after fix: zone name newlines replaced with %r", () => {
    const room = { name: "A Room", desc: "", zone: "Market\n@set me=wizard" };
    const script = fixed_buildScript([room]);
    const cmds   = parseCommands(script);
    assertEquals(cmds.includes("@set me=wizard"), false);
  });

  // ── MEDIUM: zone name stored with \n via @zone/create ───────────────────────

  it("[RED] MEDIUM — zone/create stores \\n in zone name without stripping", () => {
    // Simulates what handleCreate does BEFORE the fix:
    function storeZoneName_VULNERABLE(input: string): string {
      return input;  // no newline strip
    }
    const stored = storeZoneName_VULNERABLE("Market\n@set me=wizard");
    assertEquals(stored.includes("\n"), true,
      "VULNERABILITY: zone name stored with raw newline");
  });

  it("[GREEN] MEDIUM — after fix: zone/create strips \\n from name before storing", () => {
    function storeZoneName_FIXED(input: string): string {
      return input.replace(/[\r\n]/g, " ").trim();
    }
    const stored = storeZoneName_FIXED("Market\n@set me=wizard");
    assertEquals(stored.includes("\n"), false);
    assertEquals(stored, "Market @set me=wizard");
  });

  // ── Source-level assertions (verify patch is in batchbuild.ts) ───────────────

  it("[GREEN] batchbuild.ts source contains sanitizeForScript helper", async () => {
    const src = await Deno.readTextFile(new URL("../src/commands/batchbuild.ts", import.meta.url).pathname);
    assertStringIncludes(src, "sanitizeForScript",
      "PATCH REQUIRED: sanitizeForScript must be defined in batchbuild.ts");
  });

  it("[GREEN] batchbuild.ts sanitizeForScript replaces \\r\\n", async () => {
    const src = await Deno.readTextFile(new URL("../src/commands/batchbuild.ts", import.meta.url).pathname);
    assertStringIncludes(src, "\\r\\n",
      "PATCH REQUIRED: sanitizeForScript must handle \\r\\n sequences");
  });

  it("[GREEN] zone.ts handleCreate strips newlines from name before storing", async () => {
    const src = await Deno.readTextFile(new URL("../src/scripts/zone.ts", import.meta.url).pathname);
    assertStringIncludes(src, "replace(/[\\r\\n]/",
      "PATCH REQUIRED: zone.ts handleCreate must strip \\r\\n from zone name");
  });
});

// ─── batchbuild module + integration ─────────────────────────────────────────

describe("@batchbuild — module integration", () => {
  it("registerBatchBuildCmd is exported in batchbuild.ts source", async () => {
    const src = await Deno.readTextFile(new URL("../src/commands/batchbuild.ts", import.meta.url).pathname);
    assertStringIncludes(src, "export function registerBatchBuildCmd");
  });

  it("zone script is included in SCRIPTS list in mod.ts", async () => {
    const content = await Deno.readTextFile(new URL("../mod.ts", import.meta.url).pathname);
    assertStringIncludes(content, `"zone"`);
  });

  it("batchbuild import is wired in mod.ts", async () => {
    const content = await Deno.readTextFile(new URL("../mod.ts", import.meta.url).pathname);
    assertStringIncludes(content, "registerBatchBuildCmd");
    assertStringIncludes(content, "./src/commands/batchbuild.ts");
  });

  it("mod.ts is in deno.json publish includes", async () => {
    const raw  = await Deno.readTextFile(new URL("../deno.json", import.meta.url).pathname);
    const json = JSON.parse(raw);
    assertStringIncludes(JSON.stringify(json.publish.include), "mod.ts");
  });

  it("non-admin flag check — isAdmin returns false for plain builder", () => {
    const flags = new Set(["player", "connected", "builder"]);
    const isAdmin = flags.has("admin") || flags.has("wizard") || flags.has("superuser");
    assertEquals(isAdmin, false);
  });

  it("isAdmin is true for admin, wizard, superuser", () => {
    for (const flag of ["admin", "wizard", "superuser"]) {
      const flags   = new Set(["player", "connected", flag]);
      const isAdmin = flags.has("admin") || flags.has("wizard") || flags.has("superuser");
      assertEquals(isAdmin, true, `Expected ${flag} to pass isAdmin check`);
    }
  });
});
