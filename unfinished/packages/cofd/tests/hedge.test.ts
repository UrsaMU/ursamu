// +hedge / portaling / Mask-down gate tests (CtL).

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  checkPortalEnter,
  createHedgeway,
  defaultHedgeRoom,
  destroyHedgeway,
  findHedgewayByName,
  freeOpenForLost,
  getSeason,
  isInHedge,
  onMaskDownOpenWays,
  openHedgeway,
  otherSideRoom,
  parseHedgeRoom,
  readHedgeState,
  refreshHedgeway,
  setSeason,
  spendGlamour,
  trailActive,
  waysForRoom,
  writeHedgeState,
} from "../src/hedge/index.ts";
import { applyMaskShift } from "../src/form/index.ts";
import { hedgeExec } from "../src/commands/hedge.ts";
import { shiftExec } from "../src/commands/shift.ts";
import {
  mockPlayer,
  mockU,
  MockObjectStore,
} from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctlSheet() {
  const s = defaultSheet();
  s.template = "changeling";
  s.energyCurrent = 10;
  s.powerStatValue = 2;
  s.customFields = { seeming: "Beast" };
  return s;
}

async function cleanupWay(name: string): Promise<void> {
  const w = await findHedgewayByName(name);
  if (w) await destroyHedgeway(w.id);
}

Deno.test("parseHedgeRoom reads realm and hollow", OPTS, () => {
  const r = parseHedgeRoom({
    realm: "hollow",
    danger: "trod",
    trodRating: 3,
    hollow: { owners: ["1"], rating: 2, enhancements: [] },
  });
  assertEquals(r?.realm, "hollow");
  assertEquals(r?.trodRating, 3);
  assertEquals(r?.hollow?.rating, 2);
  assert(isInHedge(r));
});

Deno.test("defaultHedgeRoom hollow seeds owners", OPTS, () => {
  const r = defaultHedgeRoom("hollow");
  assertEquals(r.realm, "hollow");
  assertEquals(r.hollow?.rating, 1);
});

Deno.test("checkPortalEnter charges Glamour when closed", OPTS, () => {
  const sheet = ctlSheet();
  const way = {
    id: "w1",
    name: "Gate",
    mortalRoomId: "m",
    hedgeRoomId: "h",
    state: "closed" as const,
    createdBy: "x",
    createdAt: 0,
  };
  const c = checkPortalEnter(sheet, way, "spring", true);
  assertEquals(c.ok, true);
  assertEquals(c.glamourCost, 1);
  assertEquals(c.needsOpen, true);
});

Deno.test("checkPortalEnter free when open", OPTS, () => {
  const sheet = ctlSheet();
  const way = {
    id: "w1",
    name: "Gate",
    mortalRoomId: "m",
    hedgeRoomId: "h",
    state: "open" as const,
    createdBy: "x",
    createdAt: 0,
  };
  const c = checkPortalEnter(sheet, way, "spring", true);
  assertEquals(c.glamourCost, 0);
  assertEquals(c.needsOpen, false);
});

Deno.test("freeOpenForLost dormant same season", OPTS, () => {
  const way = {
    id: "w1",
    name: "Gate",
    mortalRoomId: "m",
    hedgeRoomId: "h",
    state: "dormant" as const,
    seasonStamp: "spring",
    createdBy: "x",
    createdAt: 0,
  };
  assert(freeOpenForLost(way, "spring"));
  assert(!freeOpenForLost(way, "autumn"));
});

Deno.test("otherSideRoom maps both ends", OPTS, () => {
  const way = {
    id: "w1",
    name: "Gate",
    mortalRoomId: "m1",
    hedgeRoomId: "h1",
    state: "closed" as const,
    createdBy: "x",
    createdAt: 0,
  };
  assertEquals(otherSideRoom(way, "m1"), "h1");
  assertEquals(otherSideRoom(way, "h1"), "m1");
  assertEquals(otherSideRoom(way, "x"), null);
});

Deno.test("spendGlamour and trail state", OPTS, () => {
  let s = ctlSheet();
  s = spendGlamour(s, 1);
  assertEquals(s.energyCurrent, 9);
  s = writeHedgeState(s, { trailUntil: Date.now() + 10_000 });
  assert(trailActive(s));
  assertEquals(readHedgeState(s).trailUntil! > 0, true);
});

Deno.test("openHedgeway then refresh expires to dormant", OPTS, async () => {
  await cleanupWay("test-expire-gate");
  const way = await createHedgeway(
    "test-expire-gate",
    "mort-1",
    "hedge-1",
    "staff",
  );
  const opened = await openHedgeway(way, "1", 1, "spring", 1000);
  assertEquals(opened.state, "open");
  const expired = await refreshHedgeway(opened, 8000);
  assertEquals(expired.state, "dormant");
  await destroyHedgeway(way.id);
});

Deno.test("onMaskDownOpenWays opens mortal gates", OPTS, async () => {
  await cleanupWay("test-mask-gate");
  const way = await createHedgeway(
    "test-mask-gate",
    "room-m",
    "room-h",
    "staff",
  );
  const sheet = ctlSheet();
  const r = await onMaskDownOpenWays(
    sheet,
    [way],
    "spring",
    "actor1",
  );
  assert(r.opened.length >= 1);
  assertEquals(r.opened[0].state, "open");
  assert(trailActive(r.sheet));
  assert(
    r.notes.some(
      (n) => n.includes("gateways") || n.includes("Trail"),
    ),
  );
  await destroyHedgeway(way.id);
});

Deno.test("staff +hedge/create tags room", OPTS, async () => {
  const store = new MockObjectStore();
  store.put({
    id: "2",
    name: "Room",
    flags: new Set(["room"]),
    state: {},
    contents: [],
  });
  const u = mockU({
    objectStore: store,
    me: {
      flags: new Set(["player", "connected", "builder"]),
    },
    args: ["create", "hedge"],
  });
  await hedgeExec(u);
  assertStringIncludes(u._sent.join("\n"), "hedge");
  const stored = store.get("2");
  const hr = parseHedgeRoom(stored?.state?.hedge);
  assertEquals(hr?.realm, "hedge");
});

Deno.test("non-staff cannot +hedge/create", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["create", "hedge"],
  });
  await hedgeExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("+hedge/link and /open moves changeling", OPTS, async () => {
  await cleanupWay("test-portal-a");
  const store = new MockObjectStore();
  const mortal = store.create({
    name: "Park",
    flags: new Set(["room"]),
    state: {},
  });
  const hedge = store.create({
    name: "Thicket",
    flags: new Set(["room"]),
    state: { hedge: defaultHedgeRoom("hedge") },
  });
  const sheet = ctlSheet();
  store.put({
    id: "p1",
    name: "Pix",
    flags: new Set(["player", "connected"]),
    location: mortal.id,
    state: { cofd: sheet },
    contents: [],
  });

  const staff = mockU({
    objectStore: store,
    me: {
      id: "staff1",
      flags: new Set(["player", "connected", "builder"]),
    },
    args: [
      "link",
      `test-portal-a ${mortal.id}=${hedge.id}`,
    ],
  });
  await hedgeExec(staff);
  assertStringIncludes(staff._sent.join("\n"), "linked");

  const ways = await waysForRoom(mortal.id);
  assert(ways.some((w) => w.name === "test-portal-a"));

  const u = mockU({
    objectStore: store,
    me: {
      id: "p1",
      name: "Pix",
      flags: new Set(["player", "connected"]),
      location: mortal.id,
      state: { cofd: sheet },
    },
    args: ["open", "test-portal-a"],
  });
  u.here = {
    id: mortal.id,
    name: "Park",
    flags: new Set(["room"]),
    state: {},
    contents: [],
    broadcast: () => {},
  } as never;

  await hedgeExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "portal");
  const after = store.get("p1");
  assertEquals(after?.location, hedge.id);
  const g = (after?.state?.cofd as { energyCurrent?: number })
    ?.energyCurrent;
  assertEquals(g, 9);

  await cleanupWay("test-portal-a");
});

Deno.test("+shift mien opens local hedgeway", OPTS, async () => {
  await cleanupWay("test-mien-gate");
  const store = new MockObjectStore();
  const mortal = store.create({
    name: "Street",
    flags: new Set(["room"]),
    state: {},
  });
  const hedgeR = store.create({
    name: "Briar",
    flags: new Set(["room"]),
    state: { hedge: defaultHedgeRoom("hedge") },
  });
  await createHedgeway(
    "test-mien-gate",
    mortal.id,
    hedgeR.id,
    "staff",
  );
  const sheet = ctlSheet();
  store.put({
    id: "pix2",
    name: "Pix",
    flags: new Set(["player", "connected"]),
    location: mortal.id,
    state: { cofd: sheet },
    contents: [],
  });
  const u = mockU({
    objectStore: store,
    me: {
      id: "pix2",
      name: "Pix",
      flags: new Set(["player", "connected"]),
      location: mortal.id,
      state: { cofd: sheet },
    },
    args: ["", "mien"],
  });
  u.here = {
    id: mortal.id,
    name: "Street",
    flags: new Set(["room"]),
    state: {},
    contents: [],
    broadcast: () => {},
  } as never;
  await shiftExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Mask");
  const ways = await waysForRoom(mortal.id);
  assert(ways.length >= 1);
  const refreshed = await refreshHedgeway(ways[0]);
  assertEquals(refreshed.state, "open");
  await cleanupWay("test-mien-gate");
});

Deno.test("applyMaskShift notes mention +hedge", OPTS, () => {
  const r = applyMaskShift(ctlSheet(), "mien");
  assert(r.ok);
  assert(
    r.notes?.some(
      (n) => n.includes("+hedge") || n.includes("Hedge"),
    ),
  );
});

Deno.test("getSeason / setSeason", OPTS, async () => {
  await setSeason("test-season-xyz", "staff");
  assertEquals(await getSeason(), "test-season-xyz");
});

// silence unused mockPlayer if lint
void mockPlayer;
