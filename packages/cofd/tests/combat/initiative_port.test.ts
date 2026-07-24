/**
 * Initiative port phase: formula in CofD, activate/join in @ursamu/combat.
 */
import { assert, assertEquals } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  encounterDb,
  ensureParticipant,
  rollInitiative,
} from "../../src/combat/encounter.ts";
import {
  computeCofdInitiative,
  roll1d10,
} from "../../src/combat/initiative.ts";
import { mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// deno-lint-ignore no-explicit-any
type Q = any;

function seed(
  store: MockObjectStore,
  id: string,
  name: string,
  attrs: { dex?: number; com?: number } = {},
) {
  const sheet = defaultSheet();
  sheet.attributes = {
    ...sheet.attributes,
    dexterity: attrs.dex ?? 2,
    composure: attrs.com ?? 2,
  };
  const obj = store.create({
    id,
    name,
    flags: new Set(["player", "connected"]),
    state: { cofd: sheet },
  });
  // deno-lint-ignore no-explicit-any
  (obj as any).id = id;
  // deno-lint-ignore no-explicit-any
  (store as any).store.delete(obj.id);
  // deno-lint-ignore no-explicit-any
  (store as any).store.set(id, obj);
  return obj;
}

function wireSearch(u: ReturnType<typeof mockU>, store: MockObjectStore) {
  u.db.search = async (q: Record<string, unknown>) => {
    if (q.id) {
      // deno-lint-ignore no-explicit-any
      const o = (store as any).store.get(String(q.id));
      return o ? [o] : [];
    }
    return store.search(q);
  };
}

Deno.test("roll1d10 stays in 1..10", OPTS, () => {
  for (let i = 0; i < 40; i++) {
    const n = roll1d10();
    assert(n >= 1 && n <= 10, String(n));
  }
});

Deno.test(
  "computeCofdInitiative uses Dex+Composure band",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const u = mockU({ objectStore: store });
    seed(store, "p-low", "Low", { dex: 1, com: 1 });
    seed(store, "p-high", "High", { dex: 5, com: 5 });
    wireSearch(u, store);

    // Formula min = 1+dex+com, max = 10+dex+com
    for (let i = 0; i < 15; i++) {
      const low = await computeCofdInitiative(u, "p-low");
      const high = await computeCofdInitiative(u, "p-high");
      assert(low >= 3 && low <= 12, `low=${low}`);
      assert(high >= 11 && high <= 20, `high=${high}`);
    }
  },
);

Deno.test(
  "rollInitiative activates via combat engine",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const u = mockU({ objectStore: store });
    const a = seed(store, "a1", "A", { dex: 3, com: 3 });
    const b = seed(store, "b1", "B", { dex: 2, com: 2 });
    wireSearch(u, store);

    const enc = await createEncounter("room-act");
    await addParticipant(enc.id, a as never);
    await addParticipant(enc.id, b as never);

    const out = await rollInitiative(enc.id, u);
    assert(out);
    assertEquals(out.status, "active");
    assertEquals(out.round, 1);
    assertEquals(out.turnIdx, 0);
    assertEquals(out.participants.length, 2);
    // Sorted descending
    assert(
      out.participants[0].initiative >= out.participants[1].initiative,
    );
  },
);

Deno.test(
  "ensureParticipant mid-fight joins with rolled init",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const u = mockU({ objectStore: store });
    const a = seed(store, "ea", "Early", { dex: 2, com: 2 });
    const b = seed(store, "eb", "Late", { dex: 2, com: 2 });
    const c = seed(store, "ec", "Joiner", { dex: 5, com: 5 });
    wireSearch(u, store);

    const enc = await createEncounter("room-join");
    await addParticipant(enc.id, a as never);
    await addParticipant(enc.id, b as never);
    const active = await rollInitiative(enc.id, u);
    assert(active);
    assertEquals(active.status, "active");
    assertEquals(active.participants.length, 2);

    const after = await ensureParticipant(u, enc.id, c as never);
    assert(after);
    assertEquals(after.participants.length, 3);
    assert(after.participants.some((p) => p.actorId === "ec"));
    // Joiner should have a rolled initiative > 0 almost always
    const joiner = after.participants.find((p) => p.actorId === "ec");
    assert(joiner);
    assert(joiner.initiative >= 11); // 1+5+5 min
  },
);

Deno.test(
  "cofd.encounters still used after activate",
  OPTS,
  async () => {
    // deno-lint-ignore no-explicit-any
    const ns = (encounterDb as any).namespace;
    assertEquals(
      typeof ns === "function" ? ns() : ns,
      "cofd.encounters",
    );
  },
);
