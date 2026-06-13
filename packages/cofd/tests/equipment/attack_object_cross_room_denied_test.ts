// +attack <object> must reject items not in the same room as the attacker.

import { assert, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";
import { attackExec } from "../../src/commands/attack.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+attack object scope", OPTS, () => {
  it("rejects an object in a different room", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({ id: "p1", location: "room-here", state: { cofd: defaultSheet() } });
    // Target item sits in an entirely different room.
    const target = await mockU({ me, objectStore: store }).db.create({
      name: "Knife",
      flags: new Set(["thing"]),
      location: "room-elsewhere",
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
    // Configure u.here to id "room-here" with empty contents.
    (u as unknown as { here: { id: string; contents: unknown[] } }).here = {
      id: "room-here",
      contents: [],
    };
    u.cmd.args = ["", "the-knife"];
    await attackExec(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "cannot reach");
  });

  it("accepts an object on the room floor", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({ id: "p2", location: "room-a", state: { cofd: defaultSheet() } });
    const target = await mockU({ me, objectStore: store }).db.create({
      name: "Knife",
      flags: new Set(["thing"]),
      location: "room-a",
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
    (u as unknown as { here: { id: string; contents: unknown[] } }).here = {
      id: "room-a",
      contents: [],
    };
    u.cmd.args = ["", "the-knife"];
    await attackExec(u);
    const out = u._sent.join("\n");
    assert(!out.includes("cannot reach"), `unexpected denial: ${out}`);
  });

  it("accepts an object carried by someone in the same room", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({ id: "p3", location: "room-b", state: { cofd: defaultSheet() } });
    // Another player in the same room.
    const other = mockPlayer({ id: "p-other", location: "room-b" });
    const target = await mockU({ me, objectStore: store }).db.create({
      name: "Knife",
      flags: new Set(["thing"]),
      location: "p-other",
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
    (u as unknown as { here: { id: string; contents: unknown[] } }).here = {
      id: "room-b",
      contents: [other],
    };
    u.cmd.args = ["", "the-knife"];
    await attackExec(u);
    const out = u._sent.join("\n");
    assert(!out.includes("cannot reach"), `unexpected denial: ${out}`);
  });
});
