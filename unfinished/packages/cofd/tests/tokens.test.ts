import { assertEquals, assert } from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import { gearExec, tokenExec } from "../src/commands/gear.ts";
import { mockU, mockPlayer, MockObjectStore } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function changelingSheet() {
  const sheet = defaultSheet();
  sheet.template = "changeling";
  sheet.energyCurrent = 10;
  sheet.powerStatValue = 2;
  return sheet;
}

Deno.test("Tokens - staff can create token", OPTS, async () => {
  const store = new MockObjectStore();
  const staff = mockPlayer({
    id: "1",
    name: "Staff",
    flags: new Set(["player", "connected", "admin"]),
  });
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet() },
  });
  store.put(staff);
  store.put(player);

  const u = mockU({
    me: staff,
    args: ["token/create", "Golden Apple=3/Eat a worm/Get paranoid for Player"],
    targetResult: player,
    objectStore: store,
  });

  await gearExec(u);

  // The token should be created as a Thing in player's inventory (location = 2)
  const items = (await u.db.search({ location: "2" })).filter(
    (o) => o.state?.cofd_item,
  );
  assertEquals(items.length, 1);
  const token = items[0];
  const d = token.state?.cofd_item;
  assert(d);
  assertEquals(d.kind, "token");
  assertEquals(d.tokenRating, 3);
  assertEquals(d.catch, "Eat a worm");
  assertEquals(d.drawback, "Get paranoid");
});

Deno.test("Tokens - activation spends Glamour and prints drawback", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet() },
  });
  store.put(player);

  // Seed token directly in inventory
  u_db_create(store, {
    name: "Hedge Ring",
    flags: new Set(["thing"]),
    location: "2",
    state: {
      cofd_item: {
        key: "token-hedge-ring",
        kind: "token",
        tokenRating: 2,
        catch: "Bleed on it",
        drawback: "Lose a memory",
        durability: 2,
        structure: 2,
        maxStructure: 2,
      },
    },
  });

  const u = mockU({
    me: player,
    args: ["token/activate", "Hedge Ring"],
    objectStore: store,
  });

  await gearExec(u);

  const updated = store.get("2")!;
  const sheet = updated.state.cofd as ReturnType<typeof changelingSheet>;
  assertEquals(sheet.energyCurrent, 9); // Glamour deducted
  assert(u._sent.some((m) => m.includes("activate Token")));
  assert(u._sent.some((m) => m.includes("Drawback triggered")));
});

Deno.test("Tokens - activation via Catch bypasses cost", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet() },
  });
  store.put(player);

  u_db_create(store, {
    name: "Hedge Ring",
    flags: new Set(["thing"]),
    location: "2",
    state: {
      cofd_item: {
        key: "token-hedge-ring",
        kind: "token",
        tokenRating: 2,
        catch: "Bleed on it",
        drawback: "Lose a memory",
        durability: 2,
        structure: 2,
        maxStructure: 2,
      },
    },
  });

  const u = mockU({
    me: player,
    args: ["token/activate/catch", "Hedge Ring"],
    objectStore: store,
  });

  await gearExec(u);

  const updated = store.get("2")!;
  const sheet = updated.state.cofd as ReturnType<typeof changelingSheet>;
  assertEquals(sheet.energyCurrent, 10); // Glamour NOT deducted
  assert(u._sent.some((m) => m.includes("Catch Invoked")));
});

Deno.test("Tokens - simplified +token and +token/catch commands", OPTS, async () => {
  const store = new MockObjectStore();
  const player = mockPlayer({
    id: "2",
    name: "Player",
    state: { cofd: changelingSheet() },
  });
  store.put(player);

  u_db_create(store, {
    name: "Hedge Ring",
    flags: new Set(["thing"]),
    location: "2",
    state: {
      cofd_item: {
        key: "token-hedge-ring",
        kind: "token",
        tokenRating: 2,
        catch: "Bleed on it",
        drawback: "Lose a memory",
        durability: 2,
        structure: 2,
        maxStructure: 2,
      },
    },
  });

  // Test +token/catch Hedge Ring
  const u1 = mockU({
    me: player,
    args: ["catch", "Hedge Ring"],
    objectStore: store,
  });
  await tokenExec(u1);
  const updated1 = store.get("2")!;
  const sheet1 = updated1.state.cofd as ReturnType<typeof changelingSheet>;
  assertEquals(sheet1.energyCurrent, 10); // Bypassed
  assert(u1._sent.some((m) => m.includes("Catch Invoked")));

  // Test +token Hedge Ring
  const u2 = mockU({
    me: player,
    args: ["", "Hedge Ring"],
    objectStore: store,
  });
  await tokenExec(u2);
  const updated2 = store.get("2")!;
  const sheet2 = updated2.state.cofd as ReturnType<typeof changelingSheet>;
  assertEquals(sheet2.energyCurrent, 9); // Glamour deducted
  assert(u2._sent.some((m) => m.includes("activate Token")));
});

function u_db_create(store: MockObjectStore, d: any) {
  const obj = {
    ...d,
    id: String(Math.floor(Math.random() * 100000)),
    contents: [],
  };
  store.put(obj);
  return obj;
}
