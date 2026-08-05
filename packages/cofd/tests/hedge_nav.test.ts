// Hedge navigation chase pure logic + command smoke.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  buildNavPools,
  countCondMods,
  defaultHedgeRoom,
  resolveNavTurn,
  writeNavState,
  readNavState,
} from "../src/hedge/index.ts";
import { hedgeExec } from "../src/commands/hedge.ts";
import { mockU, MockObjectStore } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sheet(over: Record<string, unknown> = {}) {
  const s = defaultSheet();
  s.template = "changeling";
  s.energyCurrent = 8;
  s.powerStatValue = 2;
  s.attributes.wits = 3;
  s.skills.survival = 2;
  s.moralityValue = 6;
  s.hedgeState = { inHedge: true };
  return { ...s, ...over };
}

Deno.test("buildNavPools: Wits+Survival and target 8-Wyrd", OPTS, () => {
  const s = sheet();
  const room = { ...defaultHedgeRoom("hedge"), danger: "hedge" as const };
  const p = buildNavPools(s, { room });
  assertEquals(p.autoSuccess, false);
  assertEquals(p.playerPool, 5); // 3+2
  assertEquals(p.target, 6); // 8-2
  assertEquals(p.hedgePool, 5);
});

Deno.test("buildNavPools: trod auto-success without urgency", OPTS, () => {
  const s = sheet();
  const room = {
    ...defaultHedgeRoom("hedge"),
    danger: "trod" as const,
    trodRating: 3,
  };
  const p = buildNavPools(s, { room });
  assertEquals(p.autoSuccess, true);
});

Deno.test("buildNavPools: Thorns +3 Hedge", OPTS, () => {
  const s = sheet();
  const room = {
    ...defaultHedgeRoom("hedge"),
    danger: "thorns" as const,
  };
  const p = buildNavPools(s, { room });
  assertEquals(p.hedgePool, 8);
});

Deno.test("buildNavPools: Lost Condition −2 player", OPTS, () => {
  const s = sheet({ conditions: [{ key: "lost" }] });
  const room = defaultHedgeRoom("hedge");
  const p = buildNavPools(s, { room });
  assertEquals(p.playerPool, 3); // 5-2
});

Deno.test("buildNavPools: urgency raises target and Hedge", OPTS, () => {
  const s = sheet();
  const room = defaultHedgeRoom("hedge");
  const p = buildNavPools(s, { room, urgency: "most" });
  assertEquals(p.target, 9); // 8-2+3
  assertEquals(p.hedgePool, 7); // 5+2 time
});

Deno.test("countCondMods pos/neg", OPTS, () => {
  const s = sheet({
    conditions: [
      { key: "inspired" },
      { key: "shaken" },
    ],
  });
  assertEquals(countCondMods(s), { pos: 1, neg: 1 });
  const p = buildNavPools(s, { room: defaultHedgeRoom("hedge") });
  // cancel — hedge stays 5
  assertEquals(p.hedgePool, 5);
});

Deno.test("resolveNavTurn: auto trod", OPTS, () => {
  const pools = {
    playerPool: 0,
    hedgePool: 0,
    target: 0,
    autoSuccess: true,
    mods: [],
  };
  const r = resolveNavTurn("Market", null, pools, 0, 0);
  assertEquals(r.kind, "auto");
  assertEquals(r.applyLost, false);
});

Deno.test("resolveNavTurn: player wins", OPTS, () => {
  const pools = {
    playerPool: 5,
    hedgePool: 5,
    target: 3,
    autoSuccess: false,
    mods: [],
  };
  const r = resolveNavTurn("Hollow", null, pools, 3, 0);
  assertEquals(r.kind, "success");
  assertEquals(r.applyLost, false);
  assertEquals(r.nav, undefined);
});

Deno.test("resolveNavTurn: Hedge wins applies Lost", OPTS, () => {
  const pools = {
    playerPool: 5,
    hedgePool: 5,
    target: 3,
    autoSuccess: false,
    mods: [],
  };
  const r = resolveNavTurn("Escape", null, pools, 0, 3);
  assertEquals(r.kind, "fail");
  assertEquals(r.applyLost, true);
});

Deno.test("resolveNavTurn: continue banks progress", OPTS, () => {
  const pools = {
    playerPool: 5,
    hedgePool: 5,
    target: 8,
    autoSuccess: false,
    mods: [],
  };
  const r = resolveNavTurn("Icon", null, pools, 2, 1);
  assertEquals(r.kind, "continue");
  assertEquals(r.progress, 2);
  assertEquals(r.hedgeProgress, 1);
  assertEquals(r.turns, 1);
  assert(r.nav);
  assertEquals(r.nav?.goal, "Icon");
});

Deno.test("writeNavState / readNavState", OPTS, () => {
  let s = sheet();
  s = writeNavState(s, {
    goal: "Gate of Horn",
    progress: 2,
    hedgeProgress: 1,
    target: 6,
    turns: 1,
    hedgeEdge: false,
    startedAt: 1,
  });
  const n = readNavState(s);
  assertEquals(n?.goal, "Gate of Horn");
  s = writeNavState(s, null);
  assertEquals(readNavState(s), null);
});

Deno.test("+hedge/travel requires Hedge", OPTS, async () => {
  const u = mockU({
    me: {
      flags: new Set(["player", "connected"]),
      state: { cofd: sheet({ hedgeState: {} }) },
    },
    args: ["travel", "Market"],
  });
  await hedgeExec(u);
  assertStringIncludes(u._sent.join("\n"), "not in the Hedge");
});

Deno.test("+hedge/travel on trod auto-succeeds", OPTS, async () => {
  const store = new MockObjectStore();
  store.put({
    id: "2",
    name: "Trod",
    flags: new Set(["room"]),
    state: {
      hedge: {
        realm: "hedge",
        danger: "trod",
        trodRating: 2,
      },
    },
    contents: [],
  });
  const s = sheet();
  const u = mockU({
    objectStore: store,
    me: {
      id: "nav1",
      flags: new Set(["player", "connected"]),
      location: "2",
      state: { cofd: s },
    },
    args: ["travel", "Goblin Market"],
  });
  u.here = {
    id: "2",
    name: "Trod",
    flags: new Set(["room"]),
    state: { hedge: { realm: "hedge", danger: "trod", trodRating: 2 } },
    contents: [],
    broadcast: () => {},
  } as never;
  await hedgeExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out.toLowerCase(), "trod");
  assertStringIncludes(out, "Goblin Market");
});

Deno.test("+hedge/travel abort clears path", OPTS, async () => {
  const s = writeNavState(sheet(), {
    goal: "Icon",
    progress: 1,
    hedgeProgress: 0,
    target: 6,
    turns: 1,
    hedgeEdge: false,
    startedAt: 1,
  });
  const store = new MockObjectStore();
  store.put({
    id: "2",
    name: "Briar",
    flags: new Set(["room"]),
    state: { hedge: defaultHedgeRoom("hedge") },
    contents: [],
  });
  store.put({
    id: "nav2",
    name: "Pix",
    flags: new Set(["player", "connected"]),
    location: "2",
    state: { cofd: s },
    contents: [],
  });
  const u = mockU({
    objectStore: store,
    me: {
      id: "nav2",
      flags: new Set(["player", "connected"]),
      location: "2",
      state: { cofd: s },
    },
    args: ["travel", "abort"],
  });
  u.here = {
    id: "2",
    name: "Briar",
    flags: new Set(["room"]),
    state: { hedge: defaultHedgeRoom("hedge") },
    contents: [],
    broadcast: () => {},
  } as never;
  await hedgeExec(u);
  assertStringIncludes(u._sent.join("\n"), "abandon");
  const after = store.get("nav2")?.state?.cofd as {
    hedgeState?: { nav?: unknown };
  };
  assertEquals(after?.hedgeState?.nav, undefined);
});
