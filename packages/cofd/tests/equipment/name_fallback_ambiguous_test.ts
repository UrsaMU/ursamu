// resolveItemRef returns an ambiguous shape when multiple items match,
// and the gear command prints all candidates.

import { assert, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";
import { createItem, resolveItemRef } from "../../src/equipment/index.ts";
import { gearExec } from "../../src/commands/gear.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function isAmbiguous(
  v: unknown,
): v is { ambiguous: true; matches: { id: string }[] } {
  return !!v && typeof v === "object" && (v as { ambiguous?: boolean }).ambiguous === true;
}

describe("resolveItemRef ambiguity", OPTS, () => {
  it("returns ambiguous shape when two items match", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p1" }), objectStore: store });
    const a = await createItem(u, "p1", "knife");
    const b = await createItem(u, "p1", "knife");
    assert(a && b);
    const got = await resolveItemRef(u, "p1", "knife");
    assert(isAmbiguous(got), `expected ambiguous shape, got: ${JSON.stringify(got)}`);
    assert(got.matches.length >= 2);
  });

  it("returns single item when only one matches", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p2" }), objectStore: store });
    const a = await createItem(u, "p2", "knife");
    assert(a);
    const got = await resolveItemRef(u, "p2", "knife");
    assert(got && !isAmbiguous(got));
  });

  it("/damage prints all candidates on ambiguous name match", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({
      id: "p3",
      flags: new Set(["player", "connected", "builder"]),
      state: { cofd: defaultSheet() },
    });
    const u = mockU({ me, objectStore: store });
    await createItem(u, "p3", "knife");
    await createItem(u, "p3", "knife");
    u.cmd.args = ["damage", "knife=1"];
    await gearExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out.toLowerCase(), "multiple matches");
  });
});
