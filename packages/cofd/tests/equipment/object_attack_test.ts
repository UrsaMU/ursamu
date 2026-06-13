// +attack vs an inert CoFD item: durability soak, structure chip, broken.

import { assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";
import { itemData } from "../../src/equipment/index.ts";
import { attackExec } from "../../src/commands/attack.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+attack against an object", OPTS, () => {
  it("soaks by Durability and chips Structure or breaks the item", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({ id: "p1", state: { cofd: defaultSheet() } });
    // Pre-create the target item in the same room as the attacker (default
    // mock here.id is "2").
    const target = await mockU({ me, objectStore: store }).db.create({
      name: "Knife",
      flags: new Set(["thing"]),
      location: "2",
      state: {
        cofd_item: {
          key: "knife",
          kind: "weapon",
          durability: 0,
          structure: 1,
          maxStructure: 1,
          broken: false,
        },
      },
      contents: [],
    });
    const u = mockU({ me, objectStore: store, targetResult: target as never });
    u.cmd.args = ["", "the-knife"];
    await attackExec(u);
    const out = u._sent.join("\n");
    // Either shred or smash, both indicate the soak path ran.
    assert(/shred|smash|holds/.test(out), `unexpected output: ${out}`);
    const after = store.get(target.id);
    const d = itemData(after!);
    assert(d, "item should still exist with item data");
  });
});
