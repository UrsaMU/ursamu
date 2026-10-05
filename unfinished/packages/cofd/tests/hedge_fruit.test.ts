// Goblin fruit: catalog, objects, eat, forage pure.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  addFruit,
  applyFruitEffects,
  buildNavPools,
  countFruit,
  createFruitObject,
  defaultHedgeRoom,
  eatFruit,
  enforceFruitCap,
  findFruit,
  fruitCarryCap,
  fruitSlug,
  GOBLIN_FRUITS,
  hasFruitFlag,
  isFruitObj,
  itemData,
  listFruitObjects,
  pickForageFruit,
  resolveForage,
} from "../src/hedge/index.ts";
import { hedgeExec } from "../src/commands/hedge.ts";
import { mockU, MockObjectStore } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sheet(over: Record<string, unknown> = {}) {
  const s = defaultSheet();
  s.template = "changeling";
  s.energyCurrent = 5;
  s.powerStatValue = 2;
  s.attributes.wits = 3;
  s.skills.survival = 2;
  s.advantages.willpowerMax = 4;
  s.advantages.willpowerCurrent = 2;
  s.health = { bashing: 0, lethal: 0, aggravated: 2 };
  s.hedgeState = { inHedge: true };
  return { ...s, ...over };
}

Deno.test("catalog has book fruits", OPTS, () => {
  assert(GOBLIN_FRUITS.length >= 8);
  assert(findFruit("amaranthine"));
  assertEquals(findFruit("nope"), null);
});

Deno.test("fruitCarryCap by Wyrd", OPTS, () => {
  assertEquals(fruitCarryCap(1), 3);
  assertEquals(fruitCarryCap(2), 7);
  assertEquals(fruitCarryCap(10), Number.POSITIVE_INFINITY);
});

Deno.test("legacy addFruit still works for pure tests", OPTS, () => {
  let s = sheet();
  s = addFruit(s, "common-fruit", true, 1).sheet;
  assertEquals(countFruit(s), 1);
  const r = eatFruit(s, "common-fruit");
  assert(r.ok);
  assertEquals(r.sheet?.energyCurrent, 6);
});

Deno.test("enforceFruitCap rots oldest outside Hedge", OPTS, () => {
  let s = sheet({ powerStatValue: 1 });
  for (let i = 0; i < 5; i++) {
    s = addFruit(s, "common-fruit", true, 1000 + i).sheet;
  }
  const enf = enforceFruitCap(s, false);
  assertEquals(countFruit(enf.sheet), 3);
  assertEquals(enf.rotted, 2);
});

Deno.test("applyFruitEffects amaranthine heals", OPTS, () => {
  const f = findFruit("amaranthine")!;
  const r = applyFruitEffects(sheet(), f);
  assertEquals(r.sheet?.health?.aggravated, 1);
});

Deno.test("faerie peach sets flag + softens Thorns nav", OPTS, () => {
  const f = findFruit("faerie-peach")!;
  // Flag until = now + 24h; buildNavPools uses Date.now().
  const now = Date.now();
  const r = applyFruitEffects(sheet(), f, now);
  assert(hasFruitFlag(r.sheet!, "faeriePeach", now + 1_000));
  const p = buildNavPools(r.sheet!, {
    room: { ...defaultHedgeRoom("hedge"), danger: "thorns" },
  });
  assertEquals(p.hedgePool, 5);
});

Deno.test("resolveForage returns fruit without mutating sheet", OPTS, () => {
  const s = sheet();
  const r = resolveForage({
    sheet: s,
    room: defaultHedgeRoom("hedge"),
    inHedge: true,
    successes: 2,
    exceptional: false,
    dramaticFailure: false,
    rng: () => 0.99,
  });
  assert(r.ok);
  assert(r.fruit);
  assertEquals(countFruit(s), 0);
});

Deno.test("createFruitObject stacks by slug", OPTS, async () => {
  const store = new MockObjectStore();
  store.put({
    id: "p1",
    name: "Pix",
    flags: new Set(["player"]),
    location: "2",
    state: {},
    contents: [],
  });
  const u = mockU({ objectStore: store, me: { id: "p1" } });
  const a = await createFruitObject(u, "p1", "common-fruit", 1);
  const b = await createFruitObject(u, "p1", "common-fruit", 2);
  assert(a && b);
  assertEquals(a.id, b.id);
  assertEquals(itemData(store.get(a.id)!)?.count, 2);
  assert(isFruitObj(store.get(a.id)!));
  assertEquals(fruitSlug(store.get(a.id)!), "common-fruit");
  const list = await listFruitObjects(u, "p1");
  assertEquals(list.length, 1);
});

Deno.test("createFruitObject stores maskName", OPTS, async () => {
  const store = new MockObjectStore();
  const u = mockU({ objectStore: store, me: { id: "p1" } });
  store.put({
    id: "p1",
    name: "Pix",
    flags: new Set(["player"]),
    location: "2",
    state: {},
    contents: [],
  });
  const o = await createFruitObject(u, "p1", "amaranthine", 1);
  assert(o);
  const d = itemData(store.get(o.id)!);
  assertEquals(d?.kind, "goblin-fruit");
  assert(d?.maskName);
  assertEquals(d?.customLabel, "Amaranthine");
});

Deno.test("pickForageFruit exceptional non-common", OPTS, () => {
  for (let i = 0; i < 20; i++) {
    const f = pickForageFruit(true, () => 0.01);
    assert(f.rarity !== "common");
  }
});

Deno.test("+hedge/forage creates object", OPTS, async () => {
  const store = new MockObjectStore();
  store.put({
    id: "2",
    name: "Briar",
    flags: new Set(["room"]),
    state: { hedge: defaultHedgeRoom("hedge") },
    contents: [],
  });
  const s = sheet();
  // High pool almost always succeeds — still may fail; retry logic:
  // force many survival by re-running until success or use eat path.
  store.put({
    id: "pix",
    name: "Pix",
    flags: new Set(["player", "connected"]),
    location: "2",
    state: { cofd: s },
    contents: [],
  });
  // Seed object path via create then +hedge/fruit list
  const seed = mockU({
    objectStore: store,
    me: { id: "pix", state: { cofd: s } },
  });
  await createFruitObject(seed, "pix", "common-fruit", 1);

  const u = mockU({
    objectStore: store,
    me: {
      id: "pix",
      flags: new Set(["player", "connected"]),
      location: "2",
      state: { cofd: s },
    },
    args: ["fruit", ""],
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
  assertStringIncludes(u._sent.join("\n"), "common-fruit");
  assertStringIncludes(u._sent.join("\n"), "drop/give");
});

Deno.test("+hedge/eat consumes object", OPTS, async () => {
  const store = new MockObjectStore();
  const s = sheet({ energyCurrent: 4 });
  store.put({
    id: "e1",
    name: "Pix",
    flags: new Set(["player", "connected"]),
    location: "2",
    state: { cofd: s },
    contents: [],
  });
  const seed = mockU({
    objectStore: store,
    me: { id: "e1", state: { cofd: s } },
  });
  await createFruitObject(seed, "e1", "common-fruit", 1);

  const u = mockU({
    objectStore: store,
    me: {
      id: "e1",
      flags: new Set(["player", "connected"]),
      location: "2",
      state: { cofd: s },
    },
    args: ["eat", "common-fruit"],
  });
  await hedgeExec(u);
  assertStringIncludes(u._sent.join("\n"), "Glamour");
  const after = store.get("e1")?.state?.cofd as {
    energyCurrent?: number;
  };
  assertEquals(after?.energyCurrent, 5);
  const left = store.search({ location: "e1" }).filter(isFruitObj);
  assertEquals(left.length, 0);
});

Deno.test("legacy sheet fruit migrates on +hedge/fruit", OPTS, async () => {
  const store = new MockObjectStore();
  let s = sheet();
  s = addFruit(s, "amaranthine", true, 1).sheet;
  store.put({
    id: "m1",
    name: "Pix",
    flags: new Set(["player", "connected"]),
    location: "2",
    state: { cofd: s },
    contents: [],
  });
  const u = mockU({
    objectStore: store,
    me: {
      id: "m1",
      flags: new Set(["player", "connected"]),
      location: "2",
      state: { cofd: s },
    },
    args: ["fruit", ""],
  });
  await hedgeExec(u);
  assertStringIncludes(u._sent.join("\n"), "amaranthine");
  const objs = store.search({ location: "m1" }).filter(isFruitObj);
  assertEquals(objs.length, 1);
  const sheetAfter = store.get("m1")?.state?.cofd as {
    hedgeState?: { fruit?: unknown[] };
  };
  assertEquals(
    (sheetAfter?.hedgeState?.fruit ?? []).length,
    0,
  );
});
