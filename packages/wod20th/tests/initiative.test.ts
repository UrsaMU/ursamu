// tests/initiative.test.ts -- pure initiative helpers.
import { assert, assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  rollInitiative,
  compareEntries,
  insertEntry,
  nextTurn,
  removeEntry,
  clearInit,
  type IInitEntry,
  type IInitState,
} from "../core/initiative.ts";

function entry(over: Partial<IInitEntry> = {}): IInitEntry {
  const dex = over.dex ?? 3;
  const wits = over.wits ?? 3;
  const d10 = over.d10 ?? 5;
  const modifier = over.modifier ?? 0;
  return {
    charId:   over.charId   ?? "c-" + Math.random().toString(36).slice(2, 6),
    playerId: over.playerId ?? "p-" + Math.random().toString(36).slice(2, 6),
    name:     over.name     ?? "Test",
    dex, wits, d10, modifier,
    total:    over.total ?? (dex + wits + d10 + modifier),
  };
}

describe("rollInitiative", () => {
  it("total = dex + wits + d10 + modifier", () => {
    const e = rollInitiative({
      charId: "c1", playerId: "p1", name: "Storms",
      dex: 3, wits: 4, modifier: 2,
      roller: () => 0.6, // -> floor(6) + 1 = 7
    });
    assertEquals(e.d10, 7);
    assertEquals(e.total, 3 + 4 + 7 + 2);
    assertEquals(e.modifier, 2);
    assertEquals(e.dex, 3);
    assertEquals(e.wits, 4);
  });

  it("default modifier is 0", () => {
    const e = rollInitiative({
      charId: "c", playerId: "p", name: "X",
      dex: 2, wits: 2, roller: () => 0,
    });
    assertEquals(e.modifier, 0);
    assertEquals(e.d10, 1);
    assertEquals(e.total, 5);
  });

  it("d10 is bounded [1,10] across random outputs", () => {
    for (let i = 0; i < 200; i++) {
      const e = rollInitiative({
        charId: "c", playerId: "p", name: "X",
        dex: 1, wits: 1, roller: Math.random,
      });
      assert(e.d10 >= 1 && e.d10 <= 10, `d10 out of range: ${e.d10}`);
    }
  });

  it("d10 boundary: roller=0 -> 1, roller near 1 -> 10", () => {
    const lo = rollInitiative({ charId: "c", playerId: "p", name: "X",
      dex: 1, wits: 1, roller: () => 0 });
    const hi = rollInitiative({ charId: "c", playerId: "p", name: "X",
      dex: 1, wits: 1, roller: () => 0.999999 });
    assertEquals(lo.d10, 1);
    assertEquals(hi.d10, 10);
  });

  it("dex/wits floor at 1", () => {
    const e = rollInitiative({ charId: "c", playerId: "p", name: "X",
      dex: 0, wits: -2, roller: () => 0 });
    assertEquals(e.dex, 1);
    assertEquals(e.wits, 1);
  });
});

describe("compareEntries", () => {
  it("sorts highest total first", () => {
    const a = entry({ total: 14, dex: 3, wits: 4 });
    const b = entry({ total: 12, dex: 3, wits: 4 });
    assert(compareEntries(a, b) < 0);
    assert(compareEntries(b, a) > 0);
  });

  it("ties broken by Dex", () => {
    const a = entry({ total: 10, dex: 4, wits: 2 });
    const b = entry({ total: 10, dex: 3, wits: 5 });
    assert(compareEntries(a, b) < 0);
  });

  it("ties broken by Wits when Dex equal", () => {
    const a = entry({ total: 10, dex: 3, wits: 4 });
    const b = entry({ total: 10, dex: 3, wits: 2 });
    assert(compareEntries(a, b) < 0);
  });
});

describe("insertEntry", () => {
  it("creates fresh state when undefined", () => {
    const e = entry({ total: 12 });
    const s = insertEntry(undefined, e);
    assertEquals(s.round, 1);
    assertEquals(s.current, 0);
    assertEquals(s.order.length, 1);
    assertEquals(s.order[0].charId, e.charId);
  });

  it("inserts into existing order keeping sort", () => {
    const a = entry({ charId: "a", total: 8,  dex: 2, wits: 3 });
    const b = entry({ charId: "b", total: 14, dex: 3, wits: 4 });
    const c = entry({ charId: "c", total: 11, dex: 3, wits: 3 });
    let s = insertEntry(undefined, a);
    s = insertEntry(s, b);
    s = insertEntry(s, c);
    assertEquals(s.order.map((e) => e.charId), ["b", "c", "a"]);
  });

  it("re-inserting same charId replaces prior entry", () => {
    const a1 = entry({ charId: "a", total: 8 });
    const a2 = entry({ charId: "a", total: 16 });
    let s = insertEntry(undefined, a1);
    s = insertEntry(s, a2);
    assertEquals(s.order.length, 1);
    assertEquals(s.order[0].total, 16);
  });
});

describe("nextTurn", () => {
  it("advances current", () => {
    const s: IInitState = {
      round: 1, startedAt: 0, current: 0,
      order: [entry({ charId: "a" }), entry({ charId: "b" })],
    };
    const n = nextTurn(s);
    assertEquals(n.current, 1);
    assertEquals(n.round, 1);
  });

  it("wraps and bumps round", () => {
    const s: IInitState = {
      round: 2, startedAt: 0, current: 1,
      order: [entry({ charId: "a" }), entry({ charId: "b" })],
    };
    const n = nextTurn(s);
    assertEquals(n.current, 0);
    assertEquals(n.round, 3);
  });
});

describe("removeEntry", () => {
  it("removes and returns null when empty", () => {
    const s = insertEntry(undefined, entry({ charId: "a" }));
    assertEquals(removeEntry(s, "a"), null);
  });

  it("keeps order otherwise", () => {
    let s = insertEntry(undefined, entry({ charId: "a", total: 14 }));
    s = insertEntry(s, entry({ charId: "b", total: 10 }));
    const r = removeEntry(s, "a")!;
    assertEquals(r.order.length, 1);
    assertEquals(r.order[0].charId, "b");
  });
});

describe("clearInit", () => {
  it("returns null", () => {
    assertEquals(clearInit(), null);
  });
});
