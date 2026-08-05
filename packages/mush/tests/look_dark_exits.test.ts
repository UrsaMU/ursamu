/**
 * Dark exits must not appear on look, and when every exit is dark the
 * Exits section (and EXITFORMAT) must be omitted entirely.
 */
import { assertEquals } from "@std/assert";
import { visibleExitsForLook, execLook } from "../src/verbs/look.ts";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockObj(
  id: string,
  flags: string[],
  extra: Partial<IDBObj> = {},
): IDBObj {
  return {
    id,
    name: id,
    flags: new Set(flags),
    state: { name: id },
    location: "room1",
    contents: [],
    ...extra,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  meFlags?: string[];
  here: IDBObj;
  canEditIds?: string[];
}): IUrsamuSDK & { _sent: string[] } {
  const sent: string[] = [];
  const me = mockObj(
    "p1",
    opts.meFlags ?? ["player", "connected"],
    opts.me,
  );
  me.location = opts.here.id;
  const canEditIds = new Set(opts.canEditIds ?? []);
  return {
    me,
    here: opts.here,
    cmd: { name: "look", original: "look", args: [], switches: [] },
    send: (m: string) => {
      sent.push(m);
    },
    broadcast: () => {},
    canEdit: (_a: IDBObj, t: IDBObj) => Promise.resolve(canEditIds.has(t.id)),
    db: {
      modify: () => Promise.resolve(),
      search: () => Promise.resolve([]),
      create: () => Promise.resolve(mockObj("99", [])),
      destroy: () => Promise.resolve(),
    },
    attr: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(false),
    },
    util: {
      target: () => Promise.resolve(null),
      displayName: (o: IDBObj) => o.name ?? "?",
      stripSubs: (s: string) => s,
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    _sent: sent,
  } as unknown as IUrsamuSDK & { _sent: string[] };
}

Deno.test(
  "visibleExitsForLook hides dark exits from normal players",
  OPTS,
  async () => {
    const actor = mockObj("p1", ["player", "connected"]);
    const lit = mockObj("e1", ["exit"]);
    const dark = mockObj("e2", ["exit", "dark"]);
    const u = mockU({
      here: mockObj("r1", ["room"], { contents: [lit, dark] }),
      canEditIds: [],
    });
    const vis = await visibleExitsForLook(u, actor, [lit, dark]);
    assertEquals(vis.map((e) => e.id), ["e1"]);
  },
);

Deno.test(
  "visibleExitsForLook shows dark exits to staff",
  OPTS,
  async () => {
    const actor = mockObj("p1", ["player", "connected", "wizard"]);
    const dark = mockObj("e2", ["exit", "dark"]);
    const u = mockU({
      here: mockObj("r1", ["room"], { contents: [dark] }),
    });
    const vis = await visibleExitsForLook(u, actor, [dark]);
    assertEquals(vis.map((e) => e.id), ["e2"]);
  },
);

Deno.test(
  "visibleExitsForLook shows dark exits when canEdit",
  OPTS,
  async () => {
    const actor = mockObj("p1", ["player", "connected"]);
    const dark = mockObj("e2", ["exit", "dark"]);
    const u = mockU({
      here: mockObj("r1", ["room"], { contents: [dark] }),
      canEditIds: ["e2"],
    });
    const vis = await visibleExitsForLook(u, actor, [dark]);
    assertEquals(vis.map((e) => e.id), ["e2"]);
  },
);

Deno.test(
  "look omits Exits section when all exits are dark",
  OPTS,
  async () => {
    const darkA = mockObj("e1", ["exit", "dark"], {
      state: { name: "North;n" },
    });
    const darkB = mockObj("e2", ["exit", "dark"], {
      state: { name: "South;s" },
    });
    const room = mockObj("r1", ["room"], {
      state: { name: "Hidden Hall", description: "Quiet." },
      contents: [darkA, darkB],
    });
    const u = mockU({ here: room, canEditIds: [] });
    await execLook(u);
    assertEquals(u._sent.length, 1);
    const out = u._sent[0];
    assertEquals(out.includes("Exits"), false);
    assertEquals(out.includes("North"), false);
    assertEquals(out.includes("South"), false);
  },
);

Deno.test(
  "look still lists non-dark exits",
  OPTS,
  async () => {
    const lit = mockObj("e1", ["exit"], {
      state: { name: "East;e" },
    });
    const dark = mockObj("e2", ["exit", "dark"], {
      state: { name: "West;w" },
    });
    const room = mockObj("r1", ["room"], {
      state: { name: "Hall", description: "A hall." },
      contents: [lit, dark],
    });
    const u = mockU({ here: room, canEditIds: [] });
    await execLook(u);
    const out = u._sent[0];
    assertEquals(out.includes("Exits"), true);
    assertEquals(out.includes("East"), true);
    assertEquals(out.includes("West"), false);
  },
);

Deno.test(
  "dark room hides CONFORMAT for mortals",
  OPTS,
  async () => {
    const other = mockObj("p2", ["player", "connected"], {
      state: { name: "Alice" },
    });
    const thing = mockObj("t1", ["thing"], {
      state: { name: "Lantern" },
    });
    const litExit = mockObj("e1", ["exit"], {
      state: { name: "Out;o" },
    });
    const room = mockObj("r1", ["room", "dark"], {
      state: { name: "Dark Cell", description: "Black." },
      contents: [other, thing, litExit],
    });
    const u = mockU({
      meFlags: ["player", "connected"],
      here: room,
      canEditIds: [],
    });
    await execLook(u);
    const out = u._sent[0];
    assertEquals(out.includes("Players"), false);
    assertEquals(out.includes("Alice"), false);
    assertEquals(out.includes("Contents"), false);
    assertEquals(out.includes("Lantern"), false);
    // Exits still list (non-dark exit)
    assertEquals(out.includes("Exits"), true);
    assertEquals(out.includes("Out"), true);
  },
);

Deno.test(
  "dark room shows CONFORMAT to staff",
  OPTS,
  async () => {
    const other = mockObj("p2", ["player", "connected"], {
      state: { name: "Alice" },
    });
    const room = mockObj("r1", ["room", "dark"], {
      state: { name: "Dark Cell", description: "Black." },
      contents: [other],
    });
    const u = mockU({
      meFlags: ["player", "connected", "wizard"],
      here: room,
      canEditIds: [],
    });
    await execLook(u);
    const out = u._sent[0];
    assertEquals(out.includes("Players"), true);
    assertEquals(out.includes("Alice"), true);
  },
);
