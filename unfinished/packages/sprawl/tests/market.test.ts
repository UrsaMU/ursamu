import { assert, assertEquals } from "@std/assert";
import {
  buyKey,
  renderMarketIndex,
  renderMarketInfo,
  renderMarketList,
  resolveMarketRef,
  shortLabel,
  tableRow,
} from "../commands/market.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function plain(s: string): string {
  return s
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "");
}

function joined(lines: string[]): string {
  return plain(lines.join("\n"));
}

function assertWidth(lines: string[]): void {
  for (const line of lines.join("\n").split("\n")) {
    if (!line.trim()) continue;
    const p = plain(line);
    if (/^[=\-─]+$/.test(p.trim().replace(/\s/g, "")) &&
      p.replace(/[─\-\s]/g, "").length === 0) {
      // skip pure rule lines
    }
    if (p.replace(/[─]/g, "").trim() === "" ||
      /^[=\-]+$/.test(p.trim())) {
      continue;
    }
    // rule line of ─ may be 74
    if (/^ {0,2}─+$/.test(p)) continue;
    assert(
      p.length <= 78,
      `wide ${p.length}: ${p}`,
    );
  }
}

Deno.test("shortLabel strips brand mark", OPTS, () => {
  assertEquals(
    shortLabel("Charon® PKD-45 Police Special Revolver"),
    "PKD-45 Police Special Revolver",
  );
  assertEquals(
    shortLabel("Orchard Technologies® Machine Link"),
    "Machine Link",
  );
});

Deno.test("buyKey shortens long slugs", OPTS, () => {
  const k = buyKey("charon-pkd-45-police-special-revolver");
  assertEquals(k, "pkd-45-police-special");
  assertEquals(
    buyKey("orchard-technologies-machine-link"),
    "machine-link",
  );
});

Deno.test("table row keeps price visible", OPTS, () => {
  const line = tableRow(2, {
    slug: "charon-pkd-45-police-special-revolver",
    name: "Charon® PKD-45 Police Special Revolver",
    cost: 500,
    category: "firearm",
  }, 700);
  const p = plain(line);
  assert(p.includes("500"));
  assert(p.includes("PKD-45") || p.includes("Police"));
  assert(p.length <= 78, p);
  // price column before long text ends
  assert(p.indexOf("500") < 12);
});

Deno.test("market index lists categories + how", OPTS, () => {
  const lines = renderMarketIndex(400);
  const t = joined(lines);
  assert(t.includes("400"));
  assert(t.includes("firearm"));
  assert(t.includes("+market/buy"));
  assertWidth(lines);
});

Deno.test("firearm table shows header and prices", OPTS, () => {
  const lines = renderMarketList({
    query: "firearm",
    bityuan: 700,
    playerId: "test-p1",
  });
  const t = joined(lines);
  assert(t.includes("b¥") || t.includes("Cost") || t.includes("#"));
  assert(t.includes("120")); // cheapest gun
  assert(t.includes("500") || t.includes("PKD") ||
    t.includes("Machine"));
  // full brand slug should not dominate the line
  assert(!t.includes("orchard-technologies-machine-link Orchard"));
  assert(t.includes("+market/buy"));
  assertWidth(lines);

  // buy by number from last list
  const row = resolveMarketRef("test-p1", "1");
  assert(row);
  assertEquals(Number(row.cost), 120);
});

Deno.test("market list by category paginates", OPTS, () => {
  const p1 = renderMarketList("general", 100);
  const t1 = joined(p1);
  assert(t1.includes("page 1/"));
  assertWidth(p1);

  const p2 = renderMarketList("general 2", 100);
  const t2 = joined(p2);
  assert(t2.includes("page 2/") || t2.includes("2/"));
  assertWidth(p2);
});

Deno.test("market info toolkit", OPTS, () => {
  const lines = renderMarketInfo("toolkit", 400);
  const t = joined(lines);
  assert(t.toLowerCase().includes("toolkit"));
  assert(t.includes("150") || t.includes("b¥"));
  assert(t.includes("Affordable") || t.includes("400"));
  assertWidth(lines);
});

Deno.test("market info unaffordable", OPTS, () => {
  const lines = renderMarketInfo("toolkit", 10);
  const t = joined(lines);
  assert(t.toLowerCase().includes("need") || t.includes("!!"));
});

Deno.test("market search lazarus", OPTS, () => {
  const lines = renderMarketList({
    query: "lazarus",
    bityuan: 1000,
    playerId: "test-p2",
  });
  const t = joined(lines);
  assert(t.toLowerCase().includes("lazarus"));
  assertWidth(lines);
});

Deno.test("empty info usage", OPTS, () => {
  const t = joined(renderMarketInfo("", 0));
  assert(t.toLowerCase().includes("usage"));
});
