// /damage with n < 1 must error, not silently coerce to 1.

import { assert, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";
import { createItem, itemData } from "../../src/equipment/index.ts";
import { gearExec } from "../../src/commands/gear.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function builderMe(id: string) {
  return mockPlayer({
    id,
    flags: new Set(["player", "connected", "builder"]),
    state: { cofd: defaultSheet() },
  });
}

describe("+gear/damage amount validation", OPTS, () => {
  it("rejects negative amount", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: builderMe("p1"), objectStore: store });
    const knife = await createItem(u, "p1", "knife");
    assert(knife);
    const before = itemData(knife)!.structure;
    u.cmd.args = ["damage", "1=-5"];
    await gearExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out.toLowerCase(), "amount");
    // Structure should not change.
    const after = itemData(store.get(knife.id)!)!;
    assert(after.structure === before, `structure changed: ${before} -> ${after.structure}`);
  });

  it("rejects zero amount", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: builderMe("p2"), objectStore: store });
    const knife = await createItem(u, "p2", "knife");
    assert(knife);
    const before = itemData(knife)!.structure;
    u.cmd.args = ["damage", "1=0"];
    await gearExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out.toLowerCase(), "amount");
    const after = itemData(store.get(knife.id)!)!;
    assert(after.structure === before);
  });

  it("accepts positive amount", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: builderMe("p3"), objectStore: store });
    const knife = await createItem(u, "p3", "knife");
    assert(knife);
    u.cmd.args = ["damage", "1=3"];
    await gearExec(u);
    const out = u._sent.join("\n");
    assert(
      !out.toLowerCase().includes("amount must"),
      `unexpected amount-error: ${out}`,
    );
  });
});
