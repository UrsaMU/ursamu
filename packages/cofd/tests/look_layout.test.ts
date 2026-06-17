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

  it("concealment gates: unequipped items hidden from strangers, visible with [concealed] to self/editors", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const stranger = mockPlayer({ id: "9", name: "Bob" });

    // Item inside Alice
    const itemObj: IDBObj = {
      id: "3",
      name: "Light Pistol",
      flags: new Set(["thing"]),
      state: {
        cofd_item: { key: "pistol-light", kind: "weapon", currentClip: 15 },
      },
      contents: [],
    };
    me.contents = [itemObj];

    const idList = "#3";

    // 1. Viewer is self (Alice looking at Alice's inventory) -> should see the item as concealed
    const uSelf = mockU({ me });
    const outSelf = await cofdConformatHandler(uSelf, me, idList);
    assertStringIncludes(outSelf ?? "", "Pistol, Light(#3) [ammo 15] [concealed]");

    // 2. Viewer is a stranger (Bob looking at Alice) -> item is unequipped, so it's treated as concealed and hidden
    const uStranger = mockU({ me: stranger, canEditResult: false });
    const outStranger = await cofdConformatHandler(uStranger, me, idList);
    assertEquals(outStranger ?? "", ""); // completely hidden, no contents list shown

    // 3. Viewer is an editor (Admin looking at Alice) -> should see the item with [concealed]
    const uEditor = mockU({ me: stranger, canEditResult: true });
    const outEditor = await cofdConformatHandler(uEditor, me, idList);
    assertStringIncludes(outEditor ?? "", "Pistol, Light(#3) [ammo 15] [concealed]");
  });

  it("equipped weapons and armor display with wielded and worn markers even if flagged dark", async () => {
    const me = mockPlayer({ id: "1", name: "Alice" });
    const observer = mockPlayer({ id: "2", name: "Bob" });

    const weaponObj: IDBObj = {
      id: "3",
      name: "Light Pistol",
      flags: new Set(["thing", "dark"]), // flagged dark
      state: {
        cofd_item: { key: "pistol-light", kind: "weapon", currentClip: 15, equippedBy: "1" },
        wielded: true, // wielded flag
      },
      contents: [],
    };

    const armorObj: IDBObj = {
      id: "4",
      name: "Flack Vest",
      flags: new Set(["thing", "dark"]), // flagged dark
      state: {
        cofd_item: { key: "kevlar-vest", kind: "armor", equippedBy: "1" },
        worn: true, // worn flag
      },
      contents: [],
    };

    me.contents = [weaponObj, armorObj];
    const idList = "#3 #4";

    // Observer looks at Alice. Since the items are equipped, they are NOT concealed, and should be visible despite "dark" flag!
    const uObs = mockU({ me: observer, canEditResult: false });
    const outObs = await cofdConformatHandler(uObs, me, idList);
    const result = outObs ?? "";

    assertStringIncludes(result, "Pistol, Light [ammo 15] (wielded)");
    assertStringIncludes(result, "Kevlar Vest (worn)");
    assertEquals(result.includes("[concealed]"), false);
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

