// /damage and /repair require builder+ even for self.

import { assert, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";
import { createItem } from "../../src/equipment/index.ts";
import { gearExec } from "../../src/commands/gear.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+gear/damage permission gate", OPTS, () => {
  it("denies non-builder calling /damage on self", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({
      id: "p1",
      flags: new Set(["player", "connected"]),
      state: { cofd: defaultSheet() },
    });
    const u = mockU({ me, objectStore: store });
    const knife = await createItem(u, "p1", "knife");
    assert(knife);
    u.cmd.args = ["damage", "1=1"];
    await gearExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "Permission denied");
    assertStringIncludes(out, "Builder");
  });

  it("allows builder to /damage on self", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({
      id: "p2",
      flags: new Set(["player", "connected", "builder"]),
      state: { cofd: defaultSheet() },
    });
    const u = mockU({ me, objectStore: store });
    const knife = await createItem(u, "p2", "knife");
    assert(knife);
    u.cmd.args = ["damage", "1=1"];
    await gearExec(u);
    const out = u._sent.join("\n");
    assert(
      !out.includes("Permission denied"),
      `expected no permission denial, got: ${out}`,
    );
  });
});

describe("+gear/repair permission gate", OPTS, () => {
  it("denies non-builder calling /repair on self", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({
      id: "p3",
      flags: new Set(["player", "connected"]),
      state: { cofd: defaultSheet() },
    });
    const u = mockU({ me, objectStore: store });
    const knife = await createItem(u, "p3", "knife");
    assert(knife);
    u.cmd.args = ["repair", "1=1"];
    await gearExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "Permission denied");
  });
});
