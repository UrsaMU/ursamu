// Equipment tests using real UrsaMU game objects (via MockObjectStore).

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import {
  createItem,
  equipItem,
  equippedArmorEntry,
  equippedWeaponEntry,
  inventoryItems,
  itemData,
  lookupItem,
  reloadItem,
  unequipItem,
} from "../src/equipment/index.ts";
import { gearExec } from "../src/commands/gear.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("equipment catalog", OPTS, () => {
  it("resolves weapon, armor, gear, service by key", () => {
    assertEquals(lookupItem("pistol-light")?.type, "weapon-ranged");
    assertEquals(lookupItem("knife")?.type, "weapon-melee");
    assertEquals(lookupItem("kevlar-vest")?.type, "armor");
    assertEquals(lookupItem("rope")?.type, "gear-physical");
    assertEquals(lookupItem("auto-repair")?.type, "service");
    assertEquals(lookupItem("unknown"), undefined);
  });
});

describe("equipment objects (MockObjectStore)", OPTS, () => {
  it("createItem makes a Thing with cofd_item state", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-1";
    const me = mockPlayer({ id: ownerId });
    const u = mockU({ me, objectStore: store });
    const obj = await createItem(u, ownerId, "pistol-light");
    assert(obj);
    assertEquals(obj.flags.has("thing"), true);
    assertEquals(obj.location, ownerId);
    const d = itemData(obj);
    assert(d);
    assertEquals(d.key, "pistol-light");
    assertEquals(d.currentClip, ((lookupItem("pistol-light")!.entry) as { clip: number }).clip);
  });

  it("melee weapons have no clip", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p1" }), objectStore: store });
    const obj = await createItem(u, "p1", "knife");
    assert(obj);
    assertEquals(itemData(obj)?.currentClip, undefined);
  });

  it("inventoryItems returns only unequipped items", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-2";
    const me = mockPlayer({ id: ownerId });
    const u = mockU({ me, objectStore: store });
    const pistol = await createItem(u, ownerId, "pistol-light");
    const knife = await createItem(u, ownerId, "knife");
    assert(pistol && knife);
    // Equip pistol
    const result = await equipItem(u, ownerId, 1, null, null);
    assert(!result.error);
    const inv = await inventoryItems(u, ownerId);
    assertEquals(inv.length, 1);
    assertEquals(itemData(inv[0])?.key, "knife");
  });

  it("equipping sets dark flag and equippedBy", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-3";
    const u = mockU({ me: mockPlayer({ id: ownerId }), objectStore: store });
    const pistol = await createItem(u, ownerId, "pistol-light");
    assert(pistol);
    const result = await equipItem(u, ownerId, 1, null, null);
    assert(!result.error);
    assert(result.slot === "weapon");
    const equipped = store.get(pistol.id);
    assert(equipped?.flags.has("dark"), "equipped item should be dark");
    assertEquals(itemData(equipped!)?.equippedBy, ownerId);
  });

  it("unequipItem removes dark flag and equippedBy", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-4";
    const u = mockU({ me: mockPlayer({ id: ownerId }), objectStore: store });
    const pistol = await createItem(u, ownerId, "pistol-light");
    assert(pistol);
    await equipItem(u, ownerId, 1, null, null);
    await unequipItem(u, pistol.id);
    const obj = store.get(pistol.id);
    assertEquals(obj?.flags.has("dark"), false);
    assertEquals(itemData(obj!)?.equippedBy, undefined);
  });

  it("rejects equipping non-weapon non-armor", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-5";
    const u = mockU({ me: mockPlayer({ id: ownerId }), objectStore: store });
    await createItem(u, ownerId, "rope");
    const result = await equipItem(u, ownerId, 1, null, null);
    assert(result.error);
    assertStringIncludes(result.error!, "not a weapon or armor");
  });

  it("equippedWeaponEntry and equippedArmorEntry resolve entries", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-6";
    const u = mockU({ me: mockPlayer({ id: ownerId }), objectStore: store });
    const pistol = await createItem(u, ownerId, "pistol-light");
    const vest = await createItem(u, ownerId, "kevlar-vest");
    assert(pistol && vest);
    const r1 = await equipItem(u, ownerId, 1, null, null);
    const r2 = await equipItem(u, ownerId, 1, null, null);
    const weaponInfo = await equippedWeaponEntry(u, r1.equippedId ?? null);
    const armorInfo = await equippedArmorEntry(u, r2.equippedId ?? null);
    assertEquals(weaponInfo?.entry.name, "Pistol, Light");
    assertEquals(armorInfo?.entry.name, "Kevlar Vest");
  });

  it("reloadItem refills the clip", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-7";
    const u = mockU({ me: mockPlayer({ id: ownerId }), objectStore: store });
    const pistol = await createItem(u, ownerId, "pistol-light");
    assert(pistol);
    // Simulate firing by updating clip to 0
    store.modify(pistol.id, "$set", { "data.cofd_item": { ...itemData(pistol), currentClip: 0 } });
    const ok = await reloadItem(u, pistol.id);
    assert(ok);
    const reloaded = store.get(pistol.id);
    assertEquals(itemData(reloaded!)?.currentClip, ((lookupItem("pistol-light")!.entry) as { clip: number }).clip);
  });
});

describe("+gear command", OPTS, () => {
  it("blocks players without an approved sheet", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p1" }), objectStore: store });
    u.cmd.args = ["add", "knife"];
    await gearExec(u);
    assertStringIncludes(u._sent.join("\n"), "approved character sheet");
  });

  it("happy path: add -> view -> equip", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-gear-1";
    const me = mockPlayer({ id: ownerId, state: { cofd: defaultSheet() } });
    const u = mockU({
      me,
      objectStore: store,
      dbModify: (_id, op, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (op === "$set" && d["data.cofd"]) {
          me.state.cofd = d["data.cofd"] as ReturnType<typeof defaultSheet>;
        }
        return Promise.resolve();
      },
    });

    u.cmd.args = ["add", "pistol-light"];
    await gearExec(u);
    assertStringIncludes(u._sent.join("\n"), "Pistol, Light");

    u._sent.length = 0;
    u.cmd.args = ["", ""];
    await gearExec(u);
    assertStringIncludes(u._sent.join("\n"), "Pistol, Light");

    u._sent.length = 0;
    u.cmd.args = ["equip", "1"];
    await gearExec(u);
    assertStringIncludes(u._sent.join("\n"), "wields");
    const sheet = me.state.cofd as ReturnType<typeof defaultSheet>;
    assert(sheet.equipment?.equippedWeapon);
  });

  it("strips MUSH codes from notes", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-gear-2";
    const me = mockPlayer({ id: ownerId, state: { cofd: defaultSheet() } });
    const u = mockU({ me, objectStore: store });
    u.cmd.args = ["add", "knife/%crRed%cn"];
    await gearExec(u);
    const inv = await inventoryItems(u, ownerId);
    assertEquals(inv[0] ? /%c/.test(JSON.stringify(itemData(inv[0]))) : false, false);
  });

  it("cross-player edit without canEdit is blocked", async () => {
    const store = new MockObjectStore();
    const me = mockPlayer({ id: "me-1", state: { cofd: defaultSheet() } });
    const other = mockPlayer({ id: "other-1", name: "Marcus", state: { cofd: defaultSheet() } });
    const u = mockU({ me, targetResult: other, canEditResult: false, objectStore: store });
    u.cmd.args = ["add", "knife for Marcus"];
    await gearExec(u);
    assertStringIncludes(u._sent.join("\n"), "Permission denied");
  });

  it("reloads equipped firearm", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-gear-3";
    const me = mockPlayer({ id: ownerId, state: { cofd: defaultSheet() } });
    const u = mockU({
      me,
      objectStore: store,
      dbModify: (_id, op, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (op === "$set" && d["data.cofd"]) {
          me.state.cofd = d["data.cofd"] as ReturnType<typeof defaultSheet>;
        }
        return Promise.resolve();
      },
    });
    u.cmd.args = ["add", "pistol-light"]; await gearExec(u);
    u.cmd.args = ["equip", "1"]; await gearExec(u);
    u.cmd.args = ["add", "magazine-9mm-light"]; await gearExec(u);
    u._sent.length = 0;
    u.cmd.args = ["reload", ""];
    await gearExec(u);
    assertStringIncludes(u._sent.join("\n"), "reload");
  });

  it("drop and pickup switches no longer exist; native get/drop/give handle this", async () => {
    const store = new MockObjectStore();
    const ownerId = "player-gear-4";
    const me = mockPlayer({ id: ownerId, state: { cofd: defaultSheet() } });
    const u = mockU({ me, objectStore: store });
    (u as unknown as { here: Record<string, unknown> }).here = {
      id: "room-99",
      contents: [],
      broadcast: () => {},
    };
    u.cmd.args = ["add", "rope"]; await gearExec(u);
    u._sent.length = 0;
    u.cmd.args = ["drop", "1"]; await gearExec(u);
    assertStringIncludes(u._sent.join("\n"), "Unknown +gear switch");
  });
});
