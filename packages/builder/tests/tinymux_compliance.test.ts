// deno-lint-ignore-file require-await
/**
 * TinyMUX compliance tests — verifies builder-plugin follows TinyMUX rules exactly.
 * Reference: /Users/kumakun/github/tinymux/mux/game/text/help.txt
 *
 * Each describe block documents the specific TinyMUX rule being enforced.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

// ─── mock helpers ─────────────────────────────────────────────────────────────

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1", name: "TestPlayer",
    flags: new Set(["player", "connected", "builder"]),
    state: { quota: 50, owner: "1" },
    location: "2", contents: [],
    ...overrides,
  };
}

function mockRoom(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "2", name: "Lobby",
    flags: new Set(["room"]),
    state: { owner: "1" },
    location: "", contents: [],
    ...overrides,
  };
}

function mockThing(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "5", name: "Widget",
    flags: new Set(["thing"]),
    state: { owner: "1" },
    location: "2", contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  switches?: string[];
  cmdName?: string;
  original?: string;
  here?: IDBObj;
  canEditResult?: boolean;
} = {}) {
  const sent: string[]           = [];
  const dbCalls: unknown[][]     = [];
  const dbCreated: unknown[]     = [];
  const dbDestroyed: string[]    = [];
  const setFlagsCalls: string[][] = [];

  const me   = mockPlayer(opts.me ?? {});
  const here = opts.here ?? mockRoom();

  // deno-lint-ignore no-explicit-any
  const u: any = {
    me, here,
    cmd: {
      name:     opts.cmdName ?? "",
      original: opts.original ?? "",
      args:     opts.args ?? [],
      switches: opts.switches ?? [],
    },
    send:      (m: string, _target?: string) => sent.push(m),
    broadcast: () => {},
    teleport:  (_who: string, _where: string) => {},
    canEdit:   async () => opts.canEditResult ?? true,
    setFlags:  async (id: string, flags: string) => { setFlagsCalls.push([id, flags]); },
    db: {
      modify:  async (...a: unknown[]) => { dbCalls.push(a); },
      search:  async () => [],
      create:  async (d: unknown) => {
        // deno-lint-ignore no-explicit-any
        const data = d as any;
        const obj = {
          ...data,
          id: "99",
          name: data.state?.name ?? "New",
          flags: data.flags ? new Set([...data.flags]) : new Set<string>(),
          contents: [],
          state: data.state ?? {},
        };
        dbCreated.push(obj);
        return obj;
      },
      destroy: async (id: string) => { dbDestroyed.push(id); },
    },
    util: {
      target:      async (_me: IDBObj, name: string) => {
        if (name === "me"   || name === me.id)   return me;
        if (name === "here" || name === here.id) return here;
        return null;
      },
      displayName: (o: IDBObj) => o.name ?? o.id ?? "Unknown",
      stripSubs:   (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center:      (s: string) => s,
      ljust:       (s: string, w: number) => s.padEnd(w),
      rjust:       (s: string, w: number) => s.padStart(w),
    },
    ui: { panel: (p: unknown) => p, layout: () => {} },
  };

  return Object.assign(u as unknown as IUrsamuSDK, {
    _sent: sent, _dbCalls: dbCalls, _dbCreated: dbCreated,
    _dbDestroyed: dbDestroyed, _setFlagsCalls: setFlagsCalls,
  });
}

// ─── @destroy — TinyMUX rules ─────────────────────────────────────────────────
//
//  • No /confirm switch — destroy is immediate for things and exits
//  • Rooms: set GOING flag and delay up to 10 min; second @destroy OR /instant destroys
//  • /instant switch: bypass GOING delay for rooms
//  • DESTROY_OK on target: anyone holding it may destroy (overrides SAFE)
//  • /override: negate SAFE protection

describe("@destroy — TinyMUX: no confirm, GOING, /instant, DESTROY_OK", () => {
  // deno-lint-ignore no-explicit-any
  async function execDestroy(u: any) {
    const { default: script } = await import("../src/scripts/destroy.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("thing is destroyed immediately — no /confirm required", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["widget"] });
    u.db.search = async () => [widget];
    await execDestroy(u);
    assertEquals(u._dbDestroyed[0], "5", "should destroy immediately without /confirm");
    assertStringIncludes(u._sent[0], "destroy");
  });

  it("room is NOT destroyed immediately — GOING flag set instead", async () => {
    const room = mockRoom({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["Hall"] });
    u.db.search = async () => [room];
    await execDestroy(u);
    assertEquals(u._dbDestroyed.length, 0, "room must NOT be destroyed immediately");
    const goingCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.going"] === true,
    );
    assertEquals(goingCall !== undefined, true, "must set data.going=true on the room");
    assertStringIncludes(u._sent[0], "going");
  });

  it("room with GOING flag already set is destroyed immediately", async () => {
    const room = mockRoom({ id: "5", flags: new Set(["room", "going"]), state: { owner: "1" } });
    const u = mockU({ args: ["Hall"] });
    let call = 0;
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [room];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "1") return [mockPlayer()];
      return [];
    };
    await execDestroy(u);
    assertEquals(u._dbDestroyed[0], "5", "GOING room must be destroyed on second @destroy call");
  });

  it("/instant destroys room immediately, bypassing GOING", async () => {
    const room = mockRoom({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["Hall"], switches: ["instant"] });
    let call = 0;
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [room];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "1") return [mockPlayer()];
      return [];
    };
    await execDestroy(u);
    assertEquals(u._dbDestroyed[0], "5", "/instant must destroy room immediately");
  });

  it("SAFE object without /override is blocked", async () => {
    const safe = mockThing({ id: "5", flags: new Set(["thing", "safe"]), state: { owner: "1" } });
    const u = mockU({ args: ["widget"] });
    u.db.search = async () => [safe];
    await execDestroy(u);
    assertEquals(u._dbDestroyed.length, 0);
    assertStringIncludes(u._sent[0], "SAFE");
  });

  it("SAFE object with /override is destroyed", async () => {
    const safe = mockThing({ id: "5", flags: new Set(["thing", "safe"]), state: { owner: "1" } });
    const u = mockU({ args: ["widget"], switches: ["override"] });
    let call = 0;
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [safe];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "1") return [mockPlayer()];
      return [];
    };
    await execDestroy(u);
    assertEquals(u._dbDestroyed[0], "5");
  });

  it("DESTROY_OK on target: actor holding it can destroy (overrides SAFE)", async () => {
    const actor  = mockPlayer({ id: "1" });
    // Widget has DESTROY_OK + SAFE, owned by someone else, held by actor
    const widget = mockThing({
      id: "5",
      flags: new Set(["thing", "destroy_ok", "safe"]),
      state: { owner: "99" },
      location: "1",   // in actor's inventory
    });
    const u = mockU({ args: ["widget"], me: actor, canEditResult: false });
    let call = 0;
    u.db.search = async () => { call++; return call === 1 ? [widget] : []; };
    await execDestroy(u);
    assertEquals(u._dbDestroyed[0], "5", "DESTROY_OK+holding must succeed even with SAFE");
  });

  it("DESTROY_OK target not held by actor: falls back to canEdit check, fails if !canEdit", async () => {
    const widget = mockThing({
      id: "5",
      flags: new Set(["thing", "destroy_ok"]),
      state: { owner: "99" },
      location: "2",   // NOT in actor's inventory
    });
    const u = mockU({ args: ["widget"], canEditResult: false });
    u.db.search = async () => [widget];
    await execDestroy(u);
    assertEquals(u._dbDestroyed.length, 0);
    assertStringIncludes(u._sent[0], "holding");
  });

  it("DESTROY_OK overrides SAFE for held objects — no /override needed", async () => {
    const actor  = mockPlayer({ id: "1" });
    const widget = mockThing({
      id: "5",
      flags: new Set(["thing", "destroy_ok", "safe"]),
      state: { owner: "1" },
      location: "1",
    });
    const u = mockU({ args: ["widget"], me: actor });
    let call = 0;
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [widget];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "1") return [actor];
      return [];
    };
    await execDestroy(u);
    assertEquals(u._dbDestroyed[0], "5", "DESTROY_OK must override SAFE without needing /override");
  });
});

// ─── @set — TinyMUX rules ─────────────────────────────────────────────────────
//
//  • Attribute syntax: @set obj=ATTR:value   (TinyMUX canonical, colon separator)
//  • Attribute copy:   @set obj=ATTR:_other/fromattr
//  • Attribute flags:  @set obj/attr=[!]attrflag  (hidden, wizard, visual, etc.)
//  • Old form:         @set obj/ATTR=value  (backward compat, supported both)
//  • Output:           "Set." for everything (flag and attribute operations)
//  • /quiet switch:    suppress "Set."

describe("@set — TinyMUX: colon syntax, /quiet, copy form, attribute flags, 'Set.' output", () => {
  // deno-lint-ignore no-explicit-any
  async function execSet(u: any) {
    const { default: script } = await import("../src/scripts/set.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("canonical form obj=ATTR:value sets attribute", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["widget=COLOR:red"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    await execSet(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.COLOR"] === "red",
    );
    assertEquals(setCall !== undefined, true, "@set widget=COLOR:red must set data.COLOR");
    assertEquals(u._sent[0], "Set.");
  });

  it("canonical form obj=ATTR: (empty value) clears attribute", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1", COLOR: "red" } });
    const u = mockU({ args: ["widget=COLOR:"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    await execSet(u);
    const unsetCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$unset" && (c[2] as Record<string, unknown>)["data.COLOR"] !== undefined,
    );
    assertEquals(unsetCall !== undefined, true, "@set widget=COLOR: must clear data.COLOR");
    assertEquals(u._sent[0], "Set.");
  });

  it("backward-compat form obj/ATTR=value still works", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["widget/COLOR=blue"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    await execSet(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.COLOR"] === "blue",
    );
    assertEquals(setCall !== undefined, true, "legacy @set widget/ATTR=value must still work");
  });

  it("copy form obj=ATTR:_other/fromattr copies attribute", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const other  = mockThing({ id: "6", name: "other", state: { owner: "1", DESC: "A blue thing." } });
    const u = mockU({ args: ["widget=DESC:_other/DESC"] });
    let targetCall = 0;
    u.util.target = async (_me: IDBObj, ref: string) => {
      if (ref === "widget") return widget;
      if (ref === "other")  return other;
      return null;
    };
    u.db.search = async () => {
      targetCall++;
      return targetCall === 1 ? [other] : [];
    };
    await execSet(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.DESC"] !== undefined,
    );
    assertEquals(setCall !== undefined, true, "copy form must set the attribute on target");
    assertEquals(u._sent[0], "Set.");
  });

  it("attribute flag form obj/ATTR=hidden stores attrflag", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["widget/COLOR=hidden"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    await execSet(u);
    const flagCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && JSON.stringify(c[2]).includes("_attrflags"),
    );
    assertEquals(flagCall !== undefined, true, "attrflag form must update _attrflags structure");
    assertEquals(u._sent[0], "Set.");
  });

  it("attribute flag form obj/ATTR=!hidden removes attrflag", async () => {
    const widget = mockThing({
      id: "5",
      state: { owner: "1", _attrflags: { COLOR: ["hidden"] } },
    });
    const u = mockU({ args: ["widget/COLOR=!hidden"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    await execSet(u);
    const flagCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && JSON.stringify(c[2]).includes("_attrflags"),
    );
    assertEquals(flagCall !== undefined, true, "removing an attrflag must write to _attrflags");
    assertEquals(u._sent[0], "Set.");
  });

  it("flag mode outputs 'Set.'", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["widget=DARK"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    u.setFlags = async () => {};
    await execSet(u);
    assertEquals(u._sent[0], "Set.");
  });

  it("/quiet suppresses 'Set.' for attribute mode", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["widget=COLOR:red"], switches: ["quiet"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    await execSet(u);
    assertEquals(u._sent.length, 0, "/quiet must produce no output");
  });

  it("/quiet suppresses 'Set.' for flag mode", async () => {
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const u = mockU({ args: ["widget=DARK"], switches: ["quiet"] });
    u.util.target = async (_me: IDBObj, ref: string) => ref === "widget" ? widget : null;
    u.setFlags = async () => {};
    await execSet(u);
    assertEquals(u._sent.length, 0, "/quiet must suppress output in flag mode");
  });
});

// ─── @wipe — TinyMUX rules ────────────────────────────────────────────────────
//
//  • No /confirm switch — wipes immediately
//  • @wipe obj          — wipes all user-set attributes
//  • @wipe obj/<wild>   — wipes only attributes matching wildcard pattern

describe("@wipe — TinyMUX: immediate, wildcard pattern", () => {
  // deno-lint-ignore no-explicit-any
  async function execWipe(u: any) {
    const { default: script } = await import("../src/scripts/wipe.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("wipes all attributes immediately — no /confirm required", async () => {
    const widget = mockThing({
      id: "5",
      state: { owner: "1", attributes: [{ name: "COLOR", value: "red" }, { name: "DESC", value: "A thing." }] },
    });
    const u = mockU({ args: ["widget"] });
    u.db.search = async () => [widget];
    await execWipe(u);
    const wipeCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && Array.isArray((c[2] as Record<string, unknown>)["data.attributes"]),
    );
    assertEquals(wipeCall !== undefined, true, "must wipe without /confirm");
    assertEquals((wipeCall?.[2] as Record<string, unknown[]>)["data.attributes"].length, 0);
    assertStringIncludes(u._sent[0], "Wiped");
  });

  it("wildcard obj/ATTRNAME wipes only that exact attribute", async () => {
    const widget = mockThing({
      id: "5",
      state: {
        owner: "1",
        attributes: [
          { name: "COLOR", value: "red" },
          { name: "DESC",  value: "A thing." },
        ],
      },
    });
    const u = mockU({ args: ["widget/COLOR"] });
    u.db.search = async () => [widget];
    await execWipe(u);
    const wipeCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.attributes"] !== undefined,
    );
    assertEquals(wipeCall !== undefined, true);
    const remaining = (wipeCall?.[2] as Record<string, { name: string }[]>)["data.attributes"];
    assertEquals(remaining.length, 1, "only COLOR should be removed");
    assertEquals(remaining[0].name, "DESC");
  });

  it("wildcard obj/C* wipes all attributes starting with C", async () => {
    const widget = mockThing({
      id: "5",
      state: {
        owner: "1",
        attributes: [
          { name: "COLOR",  value: "red" },
          { name: "COST",   value: "10" },
          { name: "DESC",   value: "A thing." },
        ],
      },
    });
    const u = mockU({ args: ["widget/C*"] });
    u.db.search = async () => [widget];
    await execWipe(u);
    const wipeCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.attributes"] !== undefined,
    );
    const remaining = (wipeCall?.[2] as Record<string, { name: string }[]>)["data.attributes"];
    assertEquals(remaining.length, 1, "COLOR and COST should be removed");
    assertEquals(remaining[0].name, "DESC");
  });

  it("wildcard obj/* wipes all attributes (same as no wildcard)", async () => {
    const widget = mockThing({
      id: "5",
      state: { owner: "1", attributes: [{ name: "A", value: "1" }, { name: "B", value: "2" }] },
    });
    const u = mockU({ args: ["widget/*"] });
    u.db.search = async () => [widget];
    await execWipe(u);
    const wipeCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.attributes"] !== undefined,
    );
    const remaining = (wipeCall?.[2] as Record<string, unknown[]>)["data.attributes"];
    assertEquals(remaining.length, 0);
  });

  it("wildcard with no matches sends informative message", async () => {
    const widget = mockThing({
      id: "5",
      state: { owner: "1", attributes: [{ name: "DESC", value: "x" }] },
    });
    const u = mockU({ args: ["widget/COLOR*"] });
    u.db.search = async () => [widget];
    await execWipe(u);
    assertEquals(u._dbCalls.length, 0, "no DB write when wildcard matches nothing");
    assertStringIncludes(u._sent[0], "No attributes matching");
  });
});

// ─── @dig — TinyMUX cost model ────────────────────────────────────────────────
//
//  • Room creation:   10 coins
//  • Exit open:        1 coin
//  • Exit link:        1 coin (so each linked exit = 2 total)
//  • @dig Hall              → costs 10
//  • @dig Hall=North        → costs 12 (10 room + 2 exit)
//  • @dig Hall=North,South  → costs 14 (10 room + 2 + 2)

describe("@dig — TinyMUX: room costs 10, each linked exit costs 2", () => {
  // deno-lint-ignore no-explicit-any
  async function execDig(u: any) {
    const { default: script } = await import("../src/scripts/dig.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("just a room costs 10 quota", async () => {
    const u = mockU({ args: ["Hall"], me: { state: { quota: 10 } } });
    u.db.search = async () => [];
    await execDig(u);
    assertStringIncludes(u._sent[0], "Hall");
    const deduct = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$inc" && (c[2] as Record<string, number>)["data.quota"] === -10,
    );
    assertEquals(deduct !== undefined, true, "room must cost 10 quota");
  });

  it("room + one exit costs 12 quota", async () => {
    const u = mockU({ args: ["Hall=North;N"], me: { state: { quota: 12 } } });
    await execDig(u);
    const deduct = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$inc" && (c[2] as Record<string, number>)["data.quota"] === -12,
    );
    assertEquals(deduct !== undefined, true, "room + exit must cost 12 quota");
  });

  it("room + both exits costs 14 quota", async () => {
    const u = mockU({ args: ["Hall=North;N,South;S"], me: { state: { quota: 14 } } });
    await execDig(u);
    const deduct = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$inc" && (c[2] as Record<string, number>)["data.quota"] === -14,
    );
    assertEquals(deduct !== undefined, true, "room + 2 exits must cost 14 quota");
  });

  it("9 quota insufficient for room (needs 10)", async () => {
    const u = mockU({ args: ["Hall"], me: { flags: new Set(["player"]), state: { quota: 9 } } });
    await execDig(u);
    assertStringIncludes(u._sent[0], "quota");
    assertEquals(u._dbCreated.length, 0);
  });

  it("staff bypass quota check regardless of cost", async () => {
    const u = mockU({ args: ["Hall=North,South"], me: { flags: new Set(["player", "wizard"]), state: { quota: 0 } } });
    await execDig(u);
    assertStringIncludes(u._sent[0], "Hall");
    assertEquals(u._dbCalls.length, 0, "staff must not have quota deducted");
  });
});

// ─── @link — TinyMUX rules ────────────────────────────────────────────────────
//
//  • `here` keyword: link destination = current room (no db search)
//  • `home` keyword: link destination = actor's home room
//  • Exits: only UNLINKED exits may be @linked; already-linked fails
//  • Ownership transfer: if exit owned by someone else, actor becomes owner
//  • Things/players: destination must be ABODE or owned by actor
//  • Rooms (dropto): destination must be LINK_OK or owned by actor

describe("@link — TinyMUX: here/home keywords, unlinked exits only, ABODE check", () => {
  // deno-lint-ignore no-explicit-any
  async function execLink(u: any) {
    const { default: script } = await import("../src/scripts/link.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("'here' keyword links to current room (no db search for destination)", async () => {
    const exit = mockThing({ id: "7", flags: new Set(["exit"]), state: { owner: "1" } });
    const here = mockRoom({ id: "2" });
    let searchCount = 0;
    const u = mockU({ args: ["North=here"], here });
    u.db.search = async () => { searchCount++; return [exit]; };
    await execLink(u);
    assertEquals(searchCount, 1, "'here' must not trigger a db.search for destination");
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.destination"] === "2",
    );
    assertEquals(setCall !== undefined, true, "must link exit to current room (id=2)");
  });

  it("'home' keyword links to actor's home room (not current room)", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 10, owner: "1", home: "99" } });
    const homeRoom = mockRoom({ id: "99", name: "Home Room" });
    const exit = mockThing({ id: "7", flags: new Set(["exit"]), state: { owner: "1" } });
    const u = mockU({ args: ["North=home"], me: actor });
    let call = 0;
    u.db.search = async (q: unknown) => {
      call++;
      if (call === 1) return [exit];
      if (typeof q === "object" && (q as Record<string, unknown>).id === "99") return [homeRoom];
      return [];
    };
    await execLink(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.destination"] === "99",
    );
    assertEquals(setCall !== undefined, true, "'home' must link to actor's home room id=99, not current room");
  });

  it("'here' is case-insensitive (HERE, Here)", async () => {
    const exit = mockThing({ id: "7", flags: new Set(["exit"]), state: { owner: "1" } });
    const here = mockRoom({ id: "2" });
    const u = mockU({ args: ["North=HERE"], here });
    u.db.search = async () => [exit];
    await execLink(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => (c[2] as Record<string, unknown>)["data.destination"] === "2",
    );
    assertEquals(setCall !== undefined, true);
  });

  it("already-linked exit cannot be re-linked", async () => {
    const exit = mockThing({
      id: "7",
      flags: new Set(["exit"]),
      state: { owner: "1", destination: "5" },   // already linked to room #5
    });
    const dest = mockRoom({ id: "3" });
    let call = 0;
    const u = mockU({ args: ["North=#3"] });
    u.db.search = async () => { call++; return call === 1 ? [exit] : [dest]; };
    await execLink(u);
    assertEquals(u._dbCalls.length, 0, "already-linked exit must not be modified");
    assertStringIncludes(u._sent[0], "linked");
  });

  it("unlinked exit can be linked by anyone — transfers ownership if needed", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 10, owner: "1" } });
    const exit  = mockThing({
      id: "7",
      flags: new Set(["exit"]),
      state: { owner: "99" },   // owned by someone else, unlinked
    });
    const dest = mockRoom({ id: "5", flags: new Set(["room", "link_ok"]) });
    let call = 0;
    const u = mockU({ args: ["North=#5"], me: actor });
    u.db.search = async () => { call++; return call === 1 ? [exit] : [dest]; };
    await execLink(u);
    const ownerChange = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.owner"] === "1",
    );
    assertEquals(ownerChange !== undefined, true, "ownership must transfer to actor");
  });

  it("thing destination must be ABODE or owned — non-ABODE unowned destination fails", async () => {
    const actor  = mockPlayer({ id: "1" });
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const dest   = mockRoom({ id: "3", flags: new Set(["room"]), state: { owner: "99" } }); // not ABODE, not owned
    let call = 0;
    const u = mockU({ args: ["widget=#3"], me: actor });
    u.db.search = async () => { call++; return call === 1 ? [widget] : [dest]; };
    // actor owns widget (canEdit=true), but doesn't own dest and dest lacks ABODE
    u.canEdit = async (_actor: IDBObj, obj: IDBObj) => obj.id === "5";
    await execLink(u);
    assertEquals(u._dbCalls.length, 0, "must fail: destination not ABODE and not owned by actor");
    assertStringIncludes(u._sent[0], "ABODE");
  });

  it("thing destination with ABODE flag allows setting home", async () => {
    const actor  = mockPlayer({ id: "1", state: { quota: 10, owner: "1" } });
    const widget = mockThing({ id: "5", state: { owner: "1" } });
    const dest   = mockRoom({ id: "3", flags: new Set(["room", "abode"]), state: { owner: "99" } });
    let call = 0;
    const u = mockU({ args: ["widget=#3"], me: actor });
    u.db.search = async () => { call++; return call === 1 ? [widget] : [dest]; };
    await execLink(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.home"] === "3",
    );
    assertEquals(setCall !== undefined, true, "ABODE destination must allow home-setting");
  });
});

// ─── @clone — TinyMUX rules ───────────────────────────────────────────────────
//
//  • Default placement: /location (current room), not inventory
//  • /inventory switch: place in actor's inventory
//  • Stripped flags by default: WIZARD, INHERIT, STAFF, etc.
//  • VISUAL objects (owned by others) can be cloned
//  • Non-VISUAL, non-owned objects cannot be cloned
//  • Rooms can be cloned
//  • If cloning someone else's object → set HALTED on clone

describe("@clone — TinyMUX: /location default, stripped flags, VISUAL, rooms, HALTED", () => {
  // deno-lint-ignore no-explicit-any
  async function execClone(u: any) {
    const { default: script } = await import("../src/scripts/clone.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("default placement is current room (/location), not inventory", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const here  = mockRoom({ id: "2" });
    const obj   = mockThing({ id: "5", state: { owner: "1", name: "Widget", attributes: [] } });
    const u = mockU({ me: actor, here });
    u.db.search = async () => [obj];
    u.cmd.args = ["widget=My Copy"];
    await execClone(u);
    const created = u._dbCreated[0] as Record<string, unknown>;
    assertEquals(created?.location, "2", "default placement must be current room");
  });

  it("/inventory places clone in actor's inventory", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const here  = mockRoom({ id: "2" });
    const obj   = mockThing({ id: "5", state: { owner: "1", name: "Widget", attributes: [] } });
    const u = mockU({ me: actor, here, switches: ["inventory"] });
    u.db.search = async () => [obj];
    u.cmd.args = ["widget=My Copy"];
    await execClone(u);
    const created = u._dbCreated[0] as Record<string, unknown>;
    assertEquals(created?.location, "1", "/inventory must place clone in actor's inventory");
  });

  it("WIZARD flag is stripped from clone by default", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const obj   = mockThing({
      id: "5",
      flags: new Set(["thing", "wizard"]),
      state: { owner: "1", name: "Wand", attributes: [] },
    });
    const u = mockU({ me: actor });
    u.db.search = async () => [obj];
    u.cmd.args = ["Wand=Copy"];
    await execClone(u);
    const created = u._dbCreated[0] as { flags: Set<string> };
    assertEquals(created?.flags?.has("wizard"), false, "WIZARD flag must be stripped from clone");
  });

  it("VISUAL object owned by others can be cloned", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const obj   = mockThing({
      id: "5",
      flags: new Set(["thing", "visual"]),
      state: { owner: "99", name: "Widget", attributes: [] },   // not owned by actor
    });
    const u = mockU({ me: actor, canEditResult: false });
    u.db.search = async () => [obj];
    u.cmd.args = ["widget=Copy"];
    await execClone(u);
    assertStringIncludes(u._sent[0], "Cloned", "VISUAL objects must be cloneable");
  });

  it("non-VISUAL object owned by someone else cannot be cloned", async () => {
    const actor = mockPlayer({ id: "1" });
    const obj   = mockThing({
      id: "5",
      flags: new Set(["thing"]),   // no VISUAL
      state: { owner: "99", name: "Widget", attributes: [] },
    });
    const u = mockU({ me: actor, canEditResult: false });
    u.db.search = async () => [obj];
    u.cmd.args = ["widget=Copy"];
    await execClone(u);
    assertEquals(u._dbCreated.length, 0, "non-VISUAL not-owned must be blocked");
    assertStringIncludes(u._sent[0], "Permission denied");
  });

  it("rooms can be cloned", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const room  = mockRoom({
      id: "5",
      state: { owner: "1", name: "Library", attributes: [] },
    });
    const u = mockU({ me: actor });
    u.db.search = async () => [room];
    u.cmd.args = ["Library=Copy of Library"];
    await execClone(u);
    assertStringIncludes(u._sent[0], "Cloned", "rooms must be cloneable");
  });

  it("cloning someone else's VISUAL object sets HALTED on the clone", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const obj   = mockThing({
      id: "5",
      flags: new Set(["thing", "visual"]),
      state: { owner: "99", name: "Widget", attributes: [] },
    });
    const u = mockU({ me: actor, canEditResult: false });
    u.db.search = async () => [obj];
    u.cmd.args = ["widget=Copy"];
    await execClone(u);
    // HALTED should be set on the newly created clone
    const haltedCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && JSON.stringify(c[2]).toLowerCase().includes("halted"),
    ) ?? u._setFlagsCalls.find((c: string[]) => c[1]?.toLowerCase().includes("halted"));
    assertEquals(haltedCall !== undefined, true, "clone of other's VISUAL must be HALTED");
  });

  it("/parent switch sets clone's parent to original", async () => {
    const actor = mockPlayer({ id: "1", state: { quota: 50, owner: "1" } });
    const obj   = mockThing({ id: "5", state: { owner: "1", name: "Widget", attributes: [] } });
    const u = mockU({ me: actor, switches: ["parent"] });
    u.db.search = async () => [obj];
    u.cmd.args = ["widget=Copy"];
    await execClone(u);
    const parentCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.parent"] === "5",
    );
    assertEquals(parentCall !== undefined, true, "/parent must set parent to original object id");
  });
});

// ─── @parent — TinyMUX rules ─────────────────────────────────────────────────
//
//  • @parent obj=        → clear parent (empty value form, no switch needed)
//  • @parent obj=parent  → set parent (must own parent OR parent is PARENT_OK)

describe("@parent — TinyMUX: empty-value clear, PARENT_OK check", () => {
  // deno-lint-ignore no-explicit-any
  async function execParent(u: any) {
    const { default: script } = await import("../src/scripts/parent.ts");
    await script(u as unknown as IUrsamuSDK);
  }

  it("@parent obj= (empty value) clears parent without switch", async () => {
    const target = mockThing({ id: "5", state: { owner: "1", parent: "10" } });
    const u = mockU({ args: ["widget="] });
    u.db.search = async () => [target];
    await execParent(u);
    const unsetCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$unset" && (c[2] as Record<string, unknown>)["data.parent"] !== undefined,
    );
    assertEquals(unsetCall !== undefined, true, "@parent obj= must clear parent");
    assertStringIncludes(u._sent[0], "cleared");
  });

  it("@parent obj=parent_ok succeeds when parent has PARENT_OK", async () => {
    const target     = mockThing({ id: "5", state: { owner: "1" } });
    const parentObj  = mockThing({
      id: "10",
      flags: new Set(["thing", "parent_ok"]),
      state: { owner: "99" },   // not owned by actor
    });
    let call = 0;
    const u = mockU({ args: ["widget=proto"], canEditResult: true });
    u.db.search = async () => { call++; return call === 1 ? [target] : [parentObj]; };
    // canEdit for parentObj returns false (not owned by actor)
    let editCall = 0;
    u.canEdit = async (_actor: IDBObj, obj: IDBObj) => {
      editCall++;
      return editCall === 1 || obj.id === "5";  // only target is editable; parent is not
    };
    await execParent(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.parent"] === "10",
    );
    assertEquals(setCall !== undefined, true, "PARENT_OK parent must be linkable");
  });

  it("@parent obj=non_parent_ok_unowned fails", async () => {
    const target    = mockThing({ id: "5", state: { owner: "1" } });
    const parentObj = mockThing({
      id: "10",
      flags: new Set(["thing"]),   // no PARENT_OK
      state: { owner: "99" },      // not owned by actor
    });
    let call = 0;
    const u = mockU({ args: ["widget=proto"] });
    u.db.search = async () => { call++; return call === 1 ? [target] : [parentObj]; };
    u.canEdit = async (_actor: IDBObj, obj: IDBObj) => obj.id === "5"; // only target editable
    await execParent(u);
    assertEquals(u._dbCalls.length, 0, "must fail: parent not PARENT_OK and not owned");
    assertStringIncludes(u._sent[0], "Permission denied");
  });

  it("@parent obj=own_obj succeeds (ownership check passes)", async () => {
    const target    = mockThing({ id: "5", state: { owner: "1" } });
    const parentObj = mockThing({ id: "10", state: { owner: "1" } }); // owned by actor
    let call = 0;
    const u = mockU({ args: ["widget=proto"] });
    u.db.search = async () => { call++; return call === 1 ? [target] : [parentObj]; };
    await execParent(u);
    const setCall = u._dbCalls.find(
      (c: unknown[]) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.parent"] === "10",
    );
    assertEquals(setCall !== undefined, true, "owned parent must be settable");
  });
});
