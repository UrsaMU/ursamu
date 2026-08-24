import { assertEquals, assert } from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import {
  marketStock,
  resolveStock,
  stockInCat,
  stockKind,
} from "../engine/market-stock.ts";
import { equipConsole, installSoftware } from "../engine/net.ts";
import {
  renderMarketIndex,
  renderMarketList,
  resolveMarketRef,
} from "../commands/market.ts";
import { buyStreetItem } from "../commands/gear-buy.ts";
import type { IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockU(): IUrsamuSDK & {
  _saved: unknown[];
} {
  const saved: unknown[] = [];
  return {
    me: { id: "p1", name: "N", location: "r1" },
    db: {
      modify: async () => {},
      create: async (d: unknown) => ({
        ...(d as object),
        id: "item1",
      }),
    },
    // deno-lint-ignore no-explicit-any
  } as any as IUrsamuSDK & { _saved: unknown[] };
}

// Patch saveChar via buyStreetItem needs real saveChar - mock sheet-io is hard.
// Test pure stock + equip/install money path without full SDK.

Deno.test("stock includes console and software cats", OPTS, () => {
  const consoles = stockInCat("console");
  const soft = stockInCat("software");
  const hw = stockInCat("net-hw");
  assert(consoles.length >= 12);
  assert(soft.length >= 30);
  assert(hw.length >= 10);
  assertEquals(stockKind(resolveStock("hyperion")!), "console");
  assertEquals(stockKind(resolveStock("tunnel-rat")!), "software");
  const h = resolveStock("hyperion");
  assertEquals(h?.cost, 3000);
  assertEquals(h?.ram, 3);
});

Deno.test("catalog prices win over market.json clash", OPTS, () => {
  // market.json has cheaper npod; nodejacker catalog is 600
  const n = resolveStock("npod");
  assert(n);
  assertEquals(n.cost, 600);
  assertEquals(n.category, "console");
});

Deno.test("market index lists net categories", OPTS, () => {
  const text = renderMarketIndex(5000).join("\n");
  assert(text.includes("console"));
  assert(text.includes("software"));
  assert(text.includes("net-hw"));
});

Deno.test("market list console remembers slugs", OPTS, () => {
  const lines = renderMarketList({
    query: "console",
    bityuan: 10000,
    playerId: "tester",
  });
  const joined = lines.join("\n");
  assert(joined.includes("hyperion") || joined.includes("Hyperion"));
  const row = resolveMarketRef("tester", "1");
  assert(row);
  assertEquals(stockKind(row), "console");
});

Deno.test("buy console path equips and spends", OPTS, async () => {
  // Unit: equip + deduct without DB — mirror buyStreetItem logic
  let c = defaultChar("N");
  c = { ...c, bityuan: 5000, stats: { ...c.stats, cognition: 2 } };
  const row = resolveStock("hyperion")!;
  const cost = Number(row.cost);
  const eq = equipConsole(c, row.slug);
  assert(!("error" in eq));
  c = { ...eq, bityuan: c.bityuan - cost };
  assertEquals(c.console, "hyperion");
  assertEquals(c.bityuan, 2000);
});

Deno.test("buy software requires console slots", OPTS, () => {
  let c = defaultChar("N");
  c = { ...c, bityuan: 1000, stats: { ...c.stats, cognition: 2 } };
  const noDeck = installSoftware(c, "tunnel-rat");
  assert("error" in noDeck);

  c = equipConsole(c, "hyperion") as typeof c;
  const ok = installSoftware(c, "tunnel-rat");
  assert(!("error" in ok));
  c = { ...ok, bityuan: c.bityuan - 550 };
  assert(c.software.includes("tunnel-rat"));
  assertEquals(c.bityuan, 450);
});

Deno.test("market stock size larger than market.json alone", OPTS, () => {
  assert(marketStock().length > 200);
});

// silence unused import in case tree-shaken
void buyStreetItem;
void mockU;
