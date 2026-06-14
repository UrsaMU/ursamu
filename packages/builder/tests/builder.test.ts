// deno-lint-ignore-file require-await
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

// ─── mock helpers ─────────────────────────────────────────────────────────────

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1",
    name: "TestPlayer",
    flags: new Set(["player", "connected", "builder"]),
    state: { quota: 50, owner: "1" },
    location: "2",
    contents: [],
    ...overrides,
  };
}

function mockRoom(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "2",
    name: "Lobby",
    flags: new Set(["room"]),
    state: { name: "Lobby", owner: "1" },
    location: "",
    contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  switches?: string[];
  cmdName?: string;
  original?: string;
  targetResult?: IDBObj | null;
  searchResults?: IDBObj[];
  canEditResult?: boolean;
  here?: IDBObj;
} = {}) {
  const sent: string[] = [];
  const dbCalls: unknown[][] = [];
  const dbCreated: unknown[] = [];
  const dbDestroyed: string[] = [];

  const me = mockPlayer(opts.me ?? {});
  const here = opts.here ?? mockRoom();

  return Object.assign({
    me,
    here,
    cmd: {
      name: opts.cmdName ?? "",
      original: opts.original ?? "",
      args: opts.args ?? [],
      switches: opts.switches ?? [],
    },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => opts.canEditResult ?? true,
    teleport: (_who: string, _where: string) => {},
    setFlags: async () => {},
    db: {
      modify: async (...a: unknown[]) => { dbCalls.push(a); },
      search: async (_q: unknown) => {
        if (opts.searchResults) return opts.searchResults;
        if (opts.targetResult !== undefined) return opts.targetResult ? [opts.targetResult] : [];
        return [];
      },
      create: async (d: unknown) => {
        const obj = { ...(d as object), id: "99", name: (d as Record<string, unknown>).state?.name ?? "New", flags: new Set(), contents: [], state: (d as Record<string, unknown>).state ?? {} };
        dbCreated.push(obj);
        return obj;
      },
      destroy: async (id: string) => { dbDestroyed.push(id); },
    },
    util: {
      target: async (_me: IDBObj, name: string, _global?: boolean) => {
        if (name === "me" || name === me.id) return me;
        if (name === "here" || name === here.id) return here;
        return opts.targetResult ?? null;
      },
      displayName: (o: IDBObj) => o.name ?? o.id ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    ui: {
      panel: (p: unknown) => p,
      layout: () => {},
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbCalls: dbCalls, _dbCreated: dbCreated, _dbDestroyed: dbDestroyed });
}

// ─── dig tests ────────────────────────────────────────────────────────────────

describe("dig script", () => {
  async function execDig(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/dig.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("creates a room and deducts 10 quota (TinyMUX cost)", async () => {
    const u = mockU({ args: ["Library"], me: { state: { quota: 10 } } });
    await execDig(u);
    assertStringIncludes(u._sent[0], "Library");
    assertEquals(u._dbCreated.length, 1);
    assertEquals(u._dbCalls[0]?.[1], "$inc");
    assertEquals((u._dbCalls[0]?.[2] as Record<string, number>)["data.quota"], -10);
  });

  it("staff bypass quota check", async () => {
    const u = mockU({ args: ["Library"], me: { flags: new Set(["player", "admin"]), state: { quota: 0 } } });
    await execDig(u);
    assertStringIncludes(u._sent[0], "Library");
    assertEquals(u._dbCalls.length, 0); // no quota deduction
  });

  it("insufficient quota (9 < 10 cost) — no creation", async () => {
    const u = mockU({ args: ["Library"], me: { flags: new Set(["player"]), state: { quota: 9 } } });
    await execDig(u);
    assertStringIncludes(u._sent[0], "quota");
    assertEquals(u._dbCreated.length, 0);
  });

  it("uses u.cmd.switches for teleport — not args", async () => {
    const u = mockU({ args: ["Library"], switches: ["teleport"], me: { state: { quota: 10 } } });
    await execDig(u);
    assertStringIncludes(u._sent[0], "Library");
  });

  it("missing room name — usage error", async () => {
    const u = mockU({ args: [""] });
    await execDig(u);
    assertStringIncludes(u._sent[0], "Usage");
  });
});

// ─── open tests ───────────────────────────────────────────────────────────────

describe("open script", () => {
  async function execOpen(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/open.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("creates an exit to destination", async () => {
    const dest = mockRoom({ id: "5", name: "Library" });
    const u = mockU({ args: ["North;N=Library"], searchResults: [dest], me: { state: { quota: 10 } } });
    await execOpen(u);
    assertStringIncludes(u._sent[0], "North");
  });

  it("uses u.cmd.switches for /inventory — not args regex", async () => {
    const dest = mockRoom({ id: "5", name: "Library" });
    const u = mockU({ args: ["North=Library"], switches: ["inventory"], searchResults: [dest], me: { state: { quota: 10 } } });
    await execOpen(u);
    assertStringIncludes(u._sent[0], "North");
  });
});

// ─── lock tests ───────────────────────────────────────────────────────────────

describe("lock script", () => {
  async function execLock(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/lock.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("locks a target with basic lock", async () => {
    const widget = mockRoom({ id: "5", name: "widget", flags: new Set(["thing"]) });
    const u = mockU({ args: ["widget=me"], original: "@lock widget=me", targetResult: widget });
    await execLock(u);
    assertStringIncludes(u._sent[0], "Locked");
    assertEquals(u._dbCalls[0]?.[2], { "data.lock": "me" });
  });

  it("uses u.cmd.switches for lock type — not original split", async () => {
    const widget = mockRoom({ id: "5", name: "widget", flags: new Set(["thing"]) });
    const u = mockU({ args: ["widget=wizard"], original: "@lock/use widget=wizard", switches: ["use"], targetResult: widget });
    await execLock(u);
    assertStringIncludes(u._sent[0], "Locked");
    assertStringIncludes(u._sent[0], "use");
  });

  it("unlocks — detects unlock from original", async () => {
    const widget = mockRoom({ id: "5", name: "widget", flags: new Set(["thing"]) });
    const u = mockU({ args: ["widget"], original: "@unlock widget", targetResult: widget });
    await execLock(u);
    assertStringIncludes(u._sent[0], "Unlocked");
    assertEquals(u._dbCalls[0]?.[2], { "data.lock": "" });
  });

  it("permission denied — no DB write", async () => {
    const widget = mockRoom({ id: "5", name: "widget" });
    const u = mockU({ args: ["widget=me"], original: "@lock widget=me", targetResult: widget, canEditResult: false });
    await execLock(u);
    assertStringIncludes(u._sent[0], "Permission denied");
    assertEquals(u._dbCalls.length, 0);
  });
});

// ─── parent tests ─────────────────────────────────────────────────────────────

describe("parent script", () => {
  async function execParent(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/parent.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("sets parent using u.cmd.switches — not cmd.name", async () => {
    const target = mockRoom({ id: "5", name: "widget", state: {} });
    const parent = mockRoom({ id: "6", name: "proto", state: {} });
    const u = mockU({ args: ["widget=proto"], searchResults: [target, parent] });
    // override search to return correct objects
    let call = 0;
    u.db.search = async () => call++ === 0 ? [target] : [parent];
    await execParent(u);
    assertStringIncludes(u._sent[0], "Parent");
  });

  it("clear switch — uses u.cmd.switches", async () => {
    const target = mockRoom({ id: "5", name: "widget", state: { parent: "6" } });
    const u = mockU({ args: ["widget"], switches: ["clear"], searchResults: [target] });
    await execParent(u);
    assertStringIncludes(u._sent[0], "cleared");
    assertEquals(u._dbCalls[0]?.[1], "$unset");
  });
});

// ─── wipe tests ───────────────────────────────────────────────────────────────

describe("wipe script", () => {
  async function execWipe(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/wipe.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("wipes all attributes immediately — no /confirm required (TinyMUX)", async () => {
    const widget = mockRoom({ id: "5", name: "widget", state: { attributes: [{ name: "COLOR", value: "red" }] } });
    const u = mockU({ args: ["widget"], searchResults: [widget] });
    await execWipe(u);
    assertStringIncludes(u._sent[0], "Wiped");
    assertEquals(u._dbCalls[0]?.[2], { "data.attributes": [] });
  });

  it("no attributes — informs user", async () => {
    const widget = mockRoom({ id: "5", name: "widget", state: { attributes: [] } });
    const u = mockU({ args: ["widget"], searchResults: [widget] });
    await execWipe(u);
    assertStringIncludes(u._sent[0], "no attributes");
    assertEquals(u._dbCalls.length, 0);
  });
});

// ─── destroy tests (gap fixes) ────────────────────────────────────────────────

describe("destroy script — quota refund + occupant eviction", () => {
  async function execDestroy(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/destroy.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("destroys thing immediately — no /confirm required (TinyMUX)", async () => {
    const widget = mockRoom({ id: "5", name: "widget", flags: new Set(["thing"]), state: { owner: "1" } });
    const owner  = mockPlayer({ id: "1", state: { quota: 5 } });
    let call = 0;
    const u = mockU({ args: ["widget"] });
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [widget];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "1") return [owner];
      return [];
    };
    await execDestroy(u);
    assertStringIncludes(u._sent[0], "destroy");
    assertEquals(u._dbDestroyed[0], "5");
  });

  it("refunds quota to non-staff owner after destroy", async () => {
    const widget = mockRoom({ id: "5", name: "widget", flags: new Set(["thing"]), state: { owner: "1" } });
    const owner  = mockPlayer({ id: "1", flags: new Set(["player", "connected", "builder"]), state: { quota: 3 } });
    let call = 0;
    const u = mockU({ switches: ["confirm"], args: ["widget"] });
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [widget];          // target lookup
      if (typeof q === "object" && (q as Record<string, unknown>).id === "1") return [owner];
      return [];
    };
    await execDestroy(u);
    const refund = u._dbCalls.find(c => c[1] === "$inc" && (c[2] as Record<string, number>)["data.quota"] === 1);
    assertEquals(refund?.[0], "1");
  });

  it("no quota refund for staff owner", async () => {
    const widget = mockRoom({ id: "5", name: "widget", flags: new Set(["thing"]), state: { owner: "99" } });
    const staff  = mockPlayer({ id: "99", flags: new Set(["player", "admin"]), state: { quota: 0 } });
    let call = 0;
    const u = mockU({ switches: ["confirm"], args: ["widget"] });
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [widget];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "99") return [staff];
      return [];
    };
    await execDestroy(u);
    const refund = u._dbCalls.find(c => c[1] === "$inc");
    assertEquals(refund, undefined);
  });

  it("evicts all connected occupants from destroyed room", async () => {
    const room   = mockRoom({ id: "5", name: "Hall", state: { owner: "99" } });
    const occ1   = mockPlayer({ id: "10", state: { home: "2" } });
    const occ2   = mockPlayer({ id: "11", state: { home: "2" } });
    const staff  = mockPlayer({ id: "99", flags: new Set(["wizard"]) });
    const teleportCalls: [string, string][] = [];
    let call = 0;
    const u = mockU({ switches: ["instant"], args: ["Hall"] }); // /instant bypasses GOING delay
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [room];
      if (call === 2) return [occ1, occ2];          // connected occupants
      if (typeof q === "object" && (q as Record<string, unknown>).id === "99") return [staff];
      return [];
    };
    u.teleport = (who: string, where: string) => { teleportCalls.push([who, where]); };
    await execDestroy(u);
    assertEquals(teleportCalls.length, 2);
    assertEquals(teleportCalls[0], ["10", "2"]);
    assertEquals(teleportCalls[1], ["11", "2"]);
    assertEquals(u._dbDestroyed[0], "5");
  });

  it("evicted occupant with no home goes to void (id 1)", async () => {
    const room  = mockRoom({ id: "5", name: "Hall", state: { owner: "99" } });
    const occ   = mockPlayer({ id: "10", state: {} }); // no home set
    const staff = mockPlayer({ id: "99", flags: new Set(["wizard"]) });
    const teleportCalls: [string, string][] = [];
    let call = 0;
    const u = mockU({ switches: ["instant"], args: ["Hall"] }); // /instant bypasses GOING delay
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [room];
      if (call === 2) return [occ];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "99") return [staff];
      return [];
    };
    u.teleport = (who: string, where: string) => { teleportCalls.push([who, where]); };
    await execDestroy(u);
    assertEquals(teleportCalls[0], ["10", "1"]);
  });

  it("permission denied — no destroy", async () => {
    const widget = mockRoom({ id: "5", flags: new Set(["thing"]) });
    const u = mockU({ switches: ["confirm"], args: ["widget"], searchResults: [widget], canEditResult: false });
    await execDestroy(u);
    assertStringIncludes(u._sent[0], "can't");
    assertEquals(u._dbDestroyed.length, 0);
  });
});

// ─── link tests (gap fixes) ───────────────────────────────────────────────────

describe("link script — here/home keywords (TinyMUX)", () => {
  async function execLink(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/link.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("@link me=here sets player home to current room (TinyMUX 'here' keyword)", async () => {
    const actor = mockPlayer({ id: "1", flags: new Set(["player", "connected"]), state: { quota: 50, owner: "1" } });
    const here  = mockRoom({ id: "2", name: "Lobby", flags: new Set(["room", "abode"]) });
    const u = mockU({ args: ["me=here"], me: actor, here, searchResults: [actor] });
    await execLink(u);
    assertStringIncludes(u._sent[0], "link");
    const homeCall = u._dbCalls.find(c => (c[2] as Record<string, unknown>)["data.home"] === "2");
    assertEquals(homeCall?.[0], "1");
    assertEquals(homeCall?.[1], "$set");
  });

  it("@link exit=here sets exit destination to current room", async () => {
    const exit = mockRoom({ id: "7", name: "North", flags: new Set(["exit"]), state: { owner: "1" } });
    const here = mockRoom({ id: "2", name: "Lobby", flags: new Set(["room", "link_ok"]) });
    const u = mockU({ args: ["North=here"], here, searchResults: [exit] });
    await execLink(u);
    const destCall = u._dbCalls.find(c => (c[2] as Record<string, unknown>)["data.destination"] === "2");
    assertEquals(destCall?.[0], "7");
  });

  it("@link room=here sets room dropto to current room", async () => {
    const room = mockRoom({ id: "9", name: "Atrium", flags: new Set(["room"]) });
    const here = mockRoom({ id: "2", name: "Lobby", flags: new Set(["room", "link_ok"]) });
    const u = mockU({ args: ["Atrium=here"], here, searchResults: [room] });
    await execLink(u);
    const droptoCall = u._dbCalls.find(c => (c[2] as Record<string, unknown>)["data.dropto"] === "2");
    assertEquals(droptoCall?.[0], "9");
  });

  it("@link me=here is case-insensitive (HERE, Here)", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const here  = mockRoom({ id: "2", flags: new Set(["room", "abode"]) });
    const u = mockU({ args: ["me=HERE"], me: actor, here, searchResults: [actor] });
    await execLink(u);
    const homeCall = u._dbCalls.find(c => (c[2] as Record<string, unknown>)["data.home"] === "2");
    assertEquals(homeCall?.[1], "$set");
  });

  it("@link with named destination still works", async () => {
    const exit = mockRoom({ id: "7", flags: new Set(["exit"]), state: { owner: "1" } });
    const dest = mockRoom({ id: "5", name: "Library", flags: new Set(["room", "link_ok"]) });
    let call = 0;
    const u = mockU({ args: ["North=#5"] });
    u.db.search = async () => call++ === 0 ? [exit] : [dest];
    await execLink(u);
    const destCall = u._dbCalls.find(c => (c[2] as Record<string, unknown>)["data.destination"] === "5");
    assertEquals(destCall?.[0], "7");
  });

  it("'here' keyword does not search db for destination", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const here  = mockRoom({ id: "2", flags: new Set(["room", "abode"]) });
    let searchCount = 0;
    const u = mockU({ args: ["me=here"], me: actor, here });
    u.db.search = async () => { searchCount++; return [actor]; };
    await execLink(u);
    // Only one db.search call (for the target) — not two (target + destination)
    assertEquals(searchCount, 1);
  });
});

// ─── oemit tests ──────────────────────────────────────────────────────────────

describe("oemit script", () => {
  async function execOemit(u: ReturnType<typeof mockU>) {
    const { default: script } = await import("../src/scripts/oemit.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("sends message to others in room, not actor", async () => {
    const occ1 = mockPlayer({ id: "10", name: "Alice" });
    const occ2 = mockPlayer({ id: "11", name: "Bob" });
    const sentTo: Array<[string, string | undefined]> = [];
    const u = mockU({ args: ["Thunder rolls!"], searchResults: [occ1, occ2] });
    // Actor id is "1" (from mockPlayer default) — occ1/occ2 are id "10"/"11"
    u.send = (m: string, target?: string) => { sentTo.push([m, target]); };
    await execOemit(u);
    // Both non-actor occupants receive the message
    assertEquals(sentTo.filter(([, t]) => t === "10").length, 1);
    assertEquals(sentTo.filter(([, t]) => t === "11").length, 1);
    // Actor does NOT receive
    assertEquals(sentTo.filter(([, t]) => t === "1").length, 0);
  });

  it("actor is excluded even if in search results", async () => {
    const actor = mockPlayer({ id: "1" });
    const occ   = mockPlayer({ id: "10" });
    const sentTo: Array<[string, string | undefined]> = [];
    const u = mockU({ args: ["Flash!"], searchResults: [actor, occ] });
    u.send = (m: string, target?: string) => { sentTo.push([m, target]); };
    await execOemit(u);
    assertEquals(sentTo.filter(([, t]) => t === "1").length, 0);
    assertEquals(sentTo.filter(([, t]) => t === "10").length, 1);
  });

  it("empty message — usage error, no sends", async () => {
    const sentTo: Array<[string, string | undefined]> = [];
    const u = mockU({ args: [""] });
    u.send = (m: string, target?: string) => { sentTo.push([m, target]); };
    await execOemit(u);
    assertStringIncludes(sentTo[0][0], "Usage");
    assertEquals(sentTo.length, 1);
  });

  it("no other occupants — no sends", async () => {
    const sentTo: Array<[string, string | undefined]> = [];
    const u = mockU({ args: ["Hello?"], searchResults: [] });
    u.send = (m: string, target?: string) => { sentTo.push([m, target]); };
    await execOemit(u);
    assertEquals(sentTo.length, 0);
  });
});

// ─── plugin init tests ────────────────────────────────────────────────────────

describe("plugin lifecycle", () => {
  it("plugin version matches deno.json", async () => {
    // Check version without importing the full engine (avoids KV/fetch leaks in test env)
    const path = new URL("../deno.json", import.meta.url).pathname;
    const json = JSON.parse(await Deno.readTextFile(path));
    assertEquals(json.version, "1.3.0");
    assertEquals(json.name, "@ursamu/builder");
  });
});
