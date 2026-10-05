// Goblin Market + Debt pure and command tests.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  addDebt,
  createMarket,
  destroyMarket,
  findMarketByRoom,
  findMarketGood,
  listingPrices,
  openDebts,
  readDebts,
  resolveBuy,
  setDebtStatus,
  totalOpenDebt,
} from "../src/market/index.ts";
import { marketExec } from "../src/commands/market.ts";
import { debtCommand } from "../src/commands/debt.ts";
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
  s.powerStatValue = 1;
  return s;
}

Deno.test("catalog has fruit and token goods", OPTS, () => {
  assert(findMarketGood("amaranthine"));
  assert(findMarketGood("trifle-token"));
  assertEquals(findMarketGood("amaranthine")!.kind, "fruit");
});

Deno.test("resolveBuy pays Glamour and reduces stock", OPTS, () => {
  const m = {
    id: "m1",
    name: "Test Mart",
    roomId: "r1",
    open: true,
    listings: [
      { slug: "common-fruit", stock: 2, seller: "Vendor" },
    ],
    createdBy: "1",
    createdAt: 1,
  };
  const r = resolveBuy(ctlSheet(), m, "common-fruit", "glamour");
  assert(r.ok);
  assertEquals(r.sheet!.energyCurrent, 9);
  assertEquals(r.market!.listings[0].stock, 1);
  assertEquals(r.fruitSlug, "common-fruit");
});

Deno.test("resolveBuy credit adds debt", OPTS, () => {
  const m = {
    id: "m1",
    name: "Test Mart",
    roomId: "r1",
    open: true,
    listings: [
      {
        slug: "trifle-token",
        stock: 1,
        seller: "Smiling hag",
      },
    ],
    createdBy: "1",
    createdAt: 1,
  };
  const r = resolveBuy(ctlSheet(), m, "trifle-token", "debt", 1000);
  assert(r.ok);
  assert(r.debt);
  assertEquals(r.debt!.amount, 1);
  assertEquals(r.debt!.to, "Smiling hag");
  assertEquals(totalOpenDebt(r.sheet!), 1);
  assertEquals(openDebts(r.sheet!).length, 1);
});

Deno.test("resolveBuy refuses closed market", OPTS, () => {
  const m = {
    id: "m1",
    name: "X",
    roomId: "r1",
    open: false,
    listings: [{ slug: "common-fruit", stock: 1 }],
    createdBy: "1",
    createdAt: 1,
  };
  const r = resolveBuy(ctlSheet(), m, "common-fruit", "glamour");
  assertEquals(r.ok, false);
});

Deno.test("setDebtStatus call and pay", OPTS, () => {
  let s = ctlSheet();
  const a = addDebt(s, {
    to: "Goblin",
    amount: 2,
    note: "test",
  }, 1);
  s = a.sheet;
  const c = setDebtStatus(s, a.debt.id, "called", {
    calledNote: "Bring teeth",
  });
  assertEquals(c.debt!.status, "called");
  const p = setDebtStatus(c.sheet, a.debt.id, "paid", {
    paidAt: 2,
  });
  assertEquals(p.debt!.status, "paid");
  assertEquals(totalOpenDebt(p.sheet), 0);
});

Deno.test("createMarket seeds listings", OPTS, async () => {
  const m = await createMarket("Night Bazaar", "room9", "wiz");
  assertEquals(m.roomId, "room9");
  assert(m.listings.length >= 1);
  assert(m.maskName);
  const found = await findMarketByRoom("room9");
  assertEquals(found?.id, m.id);
  await destroyMarket(m.id);
});

Deno.test("+market browse and buy glamour", OPTS, async () => {
  const store = new MockObjectStore();
  const m = await createMarket("Stall", "2", "wiz");
  const me = mockPlayer({
    id: "p1",
    name: "Pix",
    location: "2",
    flags: new Set(["player", "connected", "fae"]),
    state: { cofd: ctlSheet() },
  });
  store.put(me);
  store.put({
    id: "2",
    name: "Market Room",
    flags: new Set(["room"]),
    state: {},
    contents: [],
  });
  const u = mockU({ me, objectStore: store, args: ["", ""] });
  u.here = {
    id: "2",
    name: "Market Room",
    flags: new Set(["room"]),
    state: {},
    contents: [],
    broadcast: () => {},
  };
  await marketExec(u);
  assertStringIncludes(u._sent.join("\n"), "M A R K E T");

  const u2 = mockU({
    me,
    objectStore: store,
    args: ["buy", "common-fruit"],
  });
  u2.here = u.here;
  u2.me = me;
  await marketExec(u2);
  assertStringIncludes(u2._sent.join("\n"), "Glamour");
  await destroyMarket(m.id);
});

Deno.test("+debt list after credit buy", OPTS, async () => {
  let s = ctlSheet();
  const a = addDebt(s, {
    to: "Vendor",
    amount: 2,
    note: "token",
  });
  s = a.sheet;
  const me = mockPlayer({
    id: "d1",
    name: "Pix",
    state: { cofd: s },
    flags: new Set(["player", "connected"]),
  });
  const u = mockU({ me, args: ["", ""] });
  await debtCommand(u);
  assertStringIncludes(u._sent.join("\n"), "D E B T");
  assertStringIncludes(u._sent.join("\n"), "sev 2");
});

Deno.test("listingPrices uses catalog defaults", OPTS, () => {
  const m = {
    id: "m",
    name: "M",
    roomId: "r",
    open: true,
    listings: [{ slug: "amaranthine", stock: 1 }],
    createdBy: "1",
    createdAt: 1,
  };
  const p = listingPrices(m, m.listings[0]);
  assertEquals(p.glamour, 3);
  assertEquals(p.debt, 2);
});

Deno.test("readDebts empty on fresh sheet", OPTS, () => {
  assertEquals(readDebts(ctlSheet()), []);
});
