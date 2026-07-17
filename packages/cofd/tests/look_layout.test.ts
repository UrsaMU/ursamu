import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { cofdConformatHandler } from "../src/support/look_format.ts";
import type { IDBObj } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("Chronicles of Darkness look layout (CONFORMAT override)", OPTS, () => {
  it("happy path: room with items", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me });

    const roomContents: IDBObj[] = [
      mockPlayer({ id: "2", name: "Bob", flags: new Set(["player", "connected"]) }),
      {
        id: "3",
        name: "Flashlight",
        flags: new Set(["thing"]),
        state: {
          cofd_item: { key: "flashlight", kind: "gear", note: "bright LED" },
        },
        contents: [],
      },
    ];

    const target = mockPlayer({ id: "room1", name: "OOC Polis", flags: new Set(["room"]), contents: roomContents });

    // ID list contains both bob and the flashlight
    const idList = "#2 #3";

    const out = await cofdConformatHandler(u, target, idList);
    const result = out ?? "";

    // Verify Bob is in the Players section
    assertStringIncludes(result, "Players");
    assertStringIncludes(result, "Bob");

    // Verify Flashlight is in the Contents section with numbered layout
    assertStringIncludes(result, "Contents");
    assertStringIncludes(result, " 1. Flashlight(#3) -- bright LED");
  });

  it("NPC classification: NPCs show in the player list instead of contents", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me });

    const roomContents: IDBObj[] = [
      mockPlayer({ id: "2", name: "Bob", flags: new Set(["player", "connected"]) }),
      mockPlayer({ id: "3", name: "Guard NPC", flags: new Set(["npc"]) }),
    ];

    const target = mockPlayer({ id: "room1", name: "OOC Polis", flags: new Set(["room"]), contents: roomContents });
    const idList = "#2 #3";

    const out = await cofdConformatHandler(u, target, idList);
    const result = out ?? "";

    // Verify both are in the Players list
    assertStringIncludes(result, "Bob");
    assertStringIncludes(result, "Guard NPC");

    // Verify "Contents" divider does NOT appear because there are no inanimate things
    assertEquals(result.includes("Contents"), false);
  });

  it("look at person: open carry visible, concealed hidden, self sees [concealed]", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const stranger = mockPlayer({ id: "9", name: "Bob" });

    // Open-carry flashlight (not concealed, not equipped)
    const openItem: IDBObj = {
      id: "3",
      name: "Flashlight",
      flags: new Set(["thing"]),
      state: {
        cofd_item: {
          key: "flashlight",
          kind: "gear",
          customLabel: "Flashlight",
        },
      },
      contents: [],
    };
    // Explicitly concealed pistol
    const hiddenItem: IDBObj = {
      id: "4",
      name: "Light Pistol",
      flags: new Set(["thing"]),
      state: {
        concealed: true,
        cofd_item: {
          key: "pistol-light",
          kind: "weapon",
          currentClip: 15,
        },
      },
      contents: [],
    };
    // Dark spare mag (unequipped dark = bagged)
    const darkMag: IDBObj = {
      id: "5",
      name: "Mag",
      flags: new Set(["thing", "dark"]),
      state: {
        cofd_item: {
          key: "ammo-light-pistol",
          kind: "ammo",
          count: 15,
          customLabel: "Light Pistol Mag",
        },
      },
      contents: [],
    };
    me.contents = [openItem, hiddenItem, darkMag];
    const idList = "#3 #4 #5";

    // Stranger: open carry only
    const uStranger = mockU({ me: stranger, canEditResult: false });
    const outStranger = await cofdConformatHandler(uStranger, me, idList);
    const strangerView = outStranger ?? "";
    assertStringIncludes(strangerView, "Flashlight");
    assertEquals(strangerView.includes("Pistol"), false);
    assertEquals(strangerView.includes("Mag"), false);
    assertEquals(strangerView.includes("[concealed]"), false);

    // Self: open + concealed (tagged)
    const uSelf = mockU({ me });
    const outSelf = await cofdConformatHandler(uSelf, me, idList);
    const selfView = outSelf ?? "";
    assertStringIncludes(selfView, "Flashlight");
    assertStringIncludes(selfView, "Pistol, Light(#4) [ammo 15] [concealed]");
    assertStringIncludes(selfView, "Light Pistol Mag");
    assertStringIncludes(selfView, "[concealed]");

    // Editor: same as self for concealed
    const uEditor = mockU({ me: stranger, canEditResult: true });
    const outEditor = await cofdConformatHandler(uEditor, me, idList);
    assertStringIncludes(outEditor ?? "", "[concealed]");
  });

  it("equipped weapons and armor display with wielded and worn markers even if flagged dark", async () => {
    const me = mockPlayer({
      id: "1",
      name: "Alice",
      state: {
        name: "Alice",
        cofd: {
          equipment: {
            equippedWeapon: "3",
            equippedArmor: "4",
          },
        },
      },
    });
    const observer = mockPlayer({ id: "2", name: "Bob" });

    const weaponObj: IDBObj = {
      id: "3",
      name: "Light Pistol",
      flags: new Set(["thing", "dark"]),
      state: {
        cofd_item: {
          key: "pistol-light",
          kind: "weapon",
          currentClip: 15,
          equippedBy: "1",
        },
      },
      contents: [],
    };

    const armorObj: IDBObj = {
      id: "4",
      name: "Flack Vest",
      flags: new Set(["thing", "dark"]),
      state: {
        cofd_item: {
          key: "kevlar-vest",
          kind: "armor",
          equippedBy: "1",
        },
      },
      contents: [],
    };

    me.contents = [weaponObj, armorObj];
    const idList = "#3 #4";

    // Observer looks at Alice: equipped items stay visible despite dark.
    const uObs = mockU({ me: observer, canEditResult: false });
    const outObs = await cofdConformatHandler(uObs, me, idList);
    const result = outObs ?? "";

    assertStringIncludes(result, "Pistol, Light [ammo 15] (wielded)");
    assertStringIncludes(result, "Kevlar Vest (worn)");
    assertEquals(result.includes("[concealed]"), false);
  });

  it("room floor items show classic short-desc flavor", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me });

    const withDesc: IDBObj = {
      id: "10",
      name: "Iron Sword",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          {
            name: "short-desc",
            value: "A finely balanced cold-iron blade.",
          },
        ],
        cofd_item: {
          key: "sword",
          kind: "weapon",
          customLabel: "Iron Sword",
        },
      },
      contents: [],
    };

    const room = mockPlayer({
      id: "room1",
      name: "OOC Polis",
      flags: new Set(["room"]),
      contents: [withDesc],
    });

    const out = await cofdConformatHandler(u, room, "#10");
    const result = out ?? "";

    assertStringIncludes(result, "Iron Sword");
    assertStringIncludes(result, "finely balanced cold-iron blade");
  });

  it("inventory rows still omit short-desc", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me });

    const withDesc: IDBObj = {
      id: "10",
      name: "Flashlight",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          {
            name: "short-desc",
            value: "A heavy Maglite on his belt.",
          },
        ],
        cofd_item: {
          key: "flashlight",
          kind: "gear",
          customLabel: "Flashlight",
        },
      },
      contents: [],
    };

    me.contents = [withDesc];
    const out = await cofdConformatHandler(u, me, "#10");
    const result = out ?? "";

    assertStringIncludes(result, "Flashlight");
    assertEquals(result.includes("heavy Maglite"), false);
  });

  it("room floor items never show wielded/worn from stale flags", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const u = mockU({ me });

    const sword: IDBObj = {
      id: "mock-iron-sword",
      name: "Iron Sword",
      flags: new Set(["thing"]),
      state: {
        name: "Iron Sword",
        // Legacy / bad seed — must not force (wielded) on room loot.
        wielded: true,
        worn: true,
        cofd_item: {
          key: "sword",
          kind: "weapon",
          customLabel: "Iron Sword",
        },
      },
      contents: [],
    };

    const room = mockPlayer({
      id: "mock-room",
      name: "OOC Polis",
      flags: new Set(["room"]),
      contents: [sword],
    });

    const out = await cofdConformatHandler(u, room, "#mock-iron-sword");
    const result = out ?? "";

    assertStringIncludes(result, "Contents");
    assertStringIncludes(result, "Iron Sword");
    assertEquals(result.includes("(wielded)"), false);
    assertEquals(result.includes("(worn)"), false);
  });

  it("looker inclusion: looking player appears in the players list", async () => {
    const me = mockPlayer({ id: "1", name: "Alice", flags: new Set(["player", "connected"]) });
    const u = mockU({ me });

    const roomContents: IDBObj[] = [
      me,
      mockPlayer({ id: "2", name: "Bob", flags: new Set(["player", "connected"]) }),
    ];

    const target = mockPlayer({ id: "room1", name: "OOC Polis", flags: new Set(["room"]), contents: roomContents });
    const idList = "#1 #2";

    const out = await cofdConformatHandler(u, target, idList);
    const result = out ?? "";

    assertStringIncludes(result, "Alice");
    assertStringIncludes(result, "Bob");
  });
});

