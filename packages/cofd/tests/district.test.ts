import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer, MockObjectStore } from "./helpers/mockU.ts";
import { districtExec } from "../src/commands/district.ts";
import { resolveDistrictTraits } from "../src/support/district.ts";
import { rollExec } from "../src/commands/roll.ts";
import { defaultSheet } from "../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("CofD District Rules", OPTS, () => {
  it("resolves district traits on room and parent chain", async () => {
    const store = new MockObjectStore();

    const parentRoom = store.create({
      name: "ParentSlums",
      flags: new Set(["room", "parent_ok"]),
      state: {
        district_traits: {
          type: "Slums",
          access: 1,
          safety: -3,
          information: 1,
          awareness: -2,
          prestige: -3,
          stability: 1,
          safehouseLimits: { sizeMax: 3 },
        },
      },
    });

    const targetRoom = store.create({
      name: "DarkAlley",
      flags: new Set(["room"]),
      state: {
        parent: parentRoom.id,
      },
    });

    const u = mockU({
      objectStore: store,
      me: mockPlayer({ id: "1", name: "Arthur" }),
    });

    const traits = await resolveDistrictTraits(u, targetRoom.id);
    assertEquals(traits?.type, "Slums");
    assertEquals(traits?.safety, -3);
    assertEquals(traits?.safehouseLimits.sizeMax, 3);
  });

  it("+district shows inherited parent traits", async () => {
    const store = new MockObjectStore();
    const parentRoom = store.create({
      name: "ParentSlums",
      flags: new Set(["room", "parent_ok"]),
      state: {
        district_traits: {
          type: "Slums",
          access: 1,
          safety: -3,
          information: 1,
          awareness: -2,
          prestige: -3,
          stability: 1,
          safehouseLimits: { sizeMax: 3 },
        },
      },
    });

    const targetRoom = store.create({
      name: "DarkAlley",
      flags: new Set(["room"]),
      state: {
        parent: parentRoom.id,
      },
    });

    const u = mockU({
      objectStore: store,
      me: mockPlayer({ id: "1" }),
      args: ["show", targetRoom.id],
      targetResult: targetRoom,
    });

    await districtExec(u);
    assertStringIncludes(u._sent.join("\n"), "Slums");
    assertStringIncludes(u._sent.join("\n"), "Safety:      -3");
  });

  it("+district/set updates trait and saves to db", async () => {
    const store = new MockObjectStore();
    const room = store.create({
      name: "Street",
      flags: new Set(["room"]),
      state: {},
    });

    const u = mockU({
      objectStore: store,
      me: mockPlayer({
        id: "1",
        flags: new Set(["player", "connected", "admin"]),
      }),
      args: ["set", "safety=2"],
      targetResult: room,
    });
    u.here = { ...room, broadcast: () => {} } as any;

    await districtExec(u);
    assertStringIncludes(u._sent.join("\n"), "set to 2");

    const updated = await resolveDistrictTraits(u, room.id);
    assertEquals(updated?.safety, 2);
  });

  it("+district/create-parent scaffolds new parent object", async () => {
    const store = new MockObjectStore();
    const u = mockU({
      objectStore: store,
      me: mockPlayer({
        id: "1",
        flags: new Set(["player", "connected", "admin"]),
      }),
      args: ["create-parent", "NewElysium=elysium"],
    });

    await districtExec(u);
    assertStringIncludes(u._sent.join("\n"), "Created district parent");

    const all = store.search({ flags: /room/ });
    const elysiumParent = all.find((o) => o.name === "NewElysium");
    assertEquals(elysiumParent !== undefined, true);
    assertEquals((elysiumParent?.state.district_traits as any)?.type, "Elysium");
    assertEquals((elysiumParent?.state.district_traits as any)?.safety, 4);
  });

  it("+roll applies district trait modifiers", async () => {
    const store = new MockObjectStore();
    const room = store.create({
      name: "SewerAlley",
      flags: new Set(["room"]),
      state: {
        district_traits: {
          type: "Sewers",
          access: -4,
          safety: -4,
          information: -4,
          awareness: -3,
          prestige: -5,
          stability: -4,
          safehouseLimits: {},
        },
      },
    });

    const sheet = defaultSheet();
    sheet.attributes.wits = 3;
    sheet.skills.stealth = 2;

    const u = mockU({
      objectStore: store,
      me: mockPlayer({
        id: "1",
        state: { cofd: sheet },
      }),
      args: ["", "wits+stealth+safety"],
    });
    u.here = { ...room, broadcast: () => {} } as any;

    await rollExec(u);
    assertStringIncludes(u._sent[0], "ROLL>>");
    assertStringIncludes(u._sent[0], "1d");
  });
});
