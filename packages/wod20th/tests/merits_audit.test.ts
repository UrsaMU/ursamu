// tests/merits_audit.test.ts -- audit catalog coverage and integrity for WtA merits/flaws.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { WTA_MERITS, WTA_FLAWS } from "../splats/wta/data/merits.ts";

Deno.test("WTA_MERITS catalog: minimum coverage", () => {
  assert(
    WTA_MERITS.length >= 80,
    `Expected >= 80 merits, got ${WTA_MERITS.length}`,
  );
});

Deno.test("WTA_FLAWS catalog: minimum coverage", () => {
  assert(
    WTA_FLAWS.length >= 70,
    `Expected >= 70 flaws, got ${WTA_FLAWS.length}`,
  );
});

Deno.test("WTA_MERITS: every entry has non-empty name and notes", () => {
  for (const m of WTA_MERITS) {
    assert(m.name && m.name.trim().length > 0, `Empty merit name: ${JSON.stringify(m)}`);
    assert(m.notes && m.notes.trim().length > 0, `Empty merit notes: ${m.name}`);
  }
});

Deno.test("WTA_FLAWS: every entry has non-empty name and notes", () => {
  for (const f of WTA_FLAWS) {
    assert(f.name && f.name.trim().length > 0, `Empty flaw name: ${JSON.stringify(f)}`);
    assert(f.notes && f.notes.trim().length > 0, `Empty flaw notes: ${f.name}`);
  }
});

Deno.test("WTA_MERITS: no duplicate names", () => {
  const seen = new Set<string>();
  for (const m of WTA_MERITS) {
    const key = m.name.toLowerCase();
    assert(!seen.has(key), `Duplicate merit name: ${m.name}`);
    seen.add(key);
  }
});

Deno.test("WTA_FLAWS: no duplicate names", () => {
  const seen = new Set<string>();
  for (const f of WTA_FLAWS) {
    const key = f.name.toLowerCase();
    assert(!seen.has(key), `Duplicate flaw name: ${f.name}`);
    seen.add(key);
  }
});

Deno.test("WTA_MERITS: cost values within W20 range (1-7)", () => {
  for (const m of WTA_MERITS) {
    assert(
      Number.isInteger(m.cost) && m.cost >= 1 && m.cost <= 7,
      `Merit ${m.name} has out-of-range cost ${m.cost}`,
    );
  }
});

Deno.test("WTA_FLAWS: bonus values within W20 range (1-7)", () => {
  for (const f of WTA_FLAWS) {
    assert(
      Number.isInteger(f.bonus) && f.bonus >= 1 && f.bonus <= 7,
      `Flaw ${f.name} has out-of-range bonus ${f.bonus}`,
    );
  }
});

Deno.test("WTA_MERITS: categories restricted to allowed set", () => {
  const allowed = new Set(["Physical", "Mental", "Social", "Supernatural", "WtA"]);
  for (const m of WTA_MERITS) {
    assert(allowed.has(m.category), `Merit ${m.name} has bad category ${m.category}`);
  }
});

Deno.test("WTA_FLAWS: categories restricted to allowed set", () => {
  const allowed = new Set(["Physical", "Mental", "Social", "Supernatural", "WtA"]);
  for (const f of WTA_FLAWS) {
    assert(allowed.has(f.category), `Flaw ${f.name} has bad category ${f.category}`);
  }
});

Deno.test("WTA catalog: final counts (informational)", () => {
  // Sanity check: keep counts visible in test output.
  assertEquals(typeof WTA_MERITS.length, "number");
  assertEquals(typeof WTA_FLAWS.length, "number");
});
