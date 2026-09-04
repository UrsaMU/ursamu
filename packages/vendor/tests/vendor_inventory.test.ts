import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { cmds, gameHooks } from "@ursamu/mush";
import "../commands.ts";

interface IDBObj {
  id: string;
  name: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  location?: string;
}

function mockObj(overrides: Partial<IDBObj>): IDBObj {
  return {
    id: "1",
    name: "Object",
    flags: new Set(["thing"]),
    state: {},
    location: "room-1",
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  dbItems?: IDBObj[];
}) {
  const sent: string[] = [];
  const dbItems = opts.dbItems ?? [];

  return Object.assign({
    me: mockObj(opts.me ?? { id: "player-1", name: "Player" }),
    here: mockObj({ id: "room-1", name: "Room", flags: new Set(["room"]) }),
    cmd: { name: "", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => {
      sent.push(m);
    },
    db: {
      search: (query: any) => {
        if (typeof query === "string") {
          return Promise.resolve(dbItems.filter((i) => i.id === query));
        }
        if (query.location) {
          return Promise.resolve(
            dbItems.filter((i) => i.location === query.location)
          );
        }
        if (query.id) {
          return Promise.resolve(dbItems.filter((i) => i.id === query.id));
        }
        return Promise.resolve([]);
      },
      modify: (id: string, op: string, updates: any) => {
        const item = dbItems.find((i) => i.id === id);
        if (item && op === "$set") {
          for (const [k, v] of Object.entries(updates)) {
            const parts = k.split(".");
            if (parts[0] === "data") {
              if (parts.length === 2) {
                item.state[parts[1]] = v;
              } else if (parts.length === 3) {
                const sub = (item.state[parts[1]] as any) || {};
                sub[parts[2]] = v;
                item.state[parts[1]] = sub;
              }
            }
            if (k === "data.location") {
              item.location = v as string;
            }
          }
        }
        return Promise.resolve();
      },
      create: (d: any) => {
        const newItem = {
          id: `new-${Math.random()}`,
          name: d.name,
          flags: d.flags ?? new Set(["thing"]),
          location: d.location,
          state: d.state ?? {},
        };
        dbItems.push(newItem);
        return Promise.resolve(newItem);
      },
      destroy: (id: string) => {
        const idx = dbItems.findIndex((i) => i.id === id);
        if (idx >= 0) dbItems.splice(idx, 1);
        return Promise.resolve();
      },
    },
    util: {
      stripSubs: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
      resolveFormat: (target: any, slot: string, defaultArg: string) => {
        if (target.state?.[slot]) {
          return Promise.resolve(target.state[slot]);
        }
        return Promise.resolve(null);
      },
    },
  }, { _sent: sent });
}

describe("Vendor Physical Inventory & Stocking", () => {
  it("stocks an item correctly", async () => {
    const stockCmd = cmds.find((c) => c.name === "+vendor/stock");
    assertEquals(!!stockCmd, true);

    const vendor = mockObj({
      id: "vendor-1",
      name: "Blacksmith",
      state: { owner: "player-1", vendor: { inventory: [] } },
    });
    const sword = mockObj({
      id: "sword-1",
      name: "Longsword",
      location: "player-1",
    });

    const u = mockU({
      me: { id: "player-1", flags: new Set(["player"]) },
      args: ["Blacksmith", "Longsword", "15", "5"],
      dbItems: [vendor, sword],
    });

    let stockedFired = false;
    gameHooks.on("vendor:stocked", (d: any) => {
      assertEquals(d.actorId, "player-1");
      assertEquals(d.vendorId, "vendor-1");
      assertEquals(d.itemId, "sword-1");
      assertEquals(d.price, 15);
      assertEquals(d.stock, 5);
      stockedFired = true;
    });

    await stockCmd!.exec(u as any);
    assertEquals(sword.location, "vendor-1");
    assertEquals(sword.state.price, 15);
    assertEquals(sword.state.stock, 5);
    assertEquals(stockedFired, true);
    assertStringIncludes(u._sent[0], "Stocked Longsword in Blacksmith");
  });

  it("removes stocked item correctly", async () => {
    const removeCmd = cmds.find((c) => c.name === "+vendor/remove");
    assertEquals(!!removeCmd, true);

    const vendor = mockObj({
      id: "vendor-1",
      name: "Blacksmith",
      state: { owner: "player-1", vendor: { inventory: [] } },
    });
    const sword = mockObj({
      id: "sword-1",
      name: "Longsword",
      location: "vendor-1",
      state: { price: 15, stock: 5 },
    });

    const u = mockU({
      me: { id: "player-1", flags: new Set(["player"]) },
      args: ["Blacksmith", "Longsword"],
      dbItems: [vendor, sword],
    });

    let removedFired = false;
    gameHooks.on("vendor:removed", (d: any) => {
      assertEquals(d.actorId, "player-1");
      assertEquals(d.vendorId, "vendor-1");
      assertEquals(d.itemId, "sword-1");
      removedFired = true;
    });

    await removeCmd!.exec(u as any);
    assertEquals(sword.location, "player-1");
    assertEquals(removedFired, true);
    assertStringIncludes(u._sent[0], "Removed Longsword from Blacksmith");
  });

  it("lists physical inventory and honors stock status", async () => {
    const listCmd = cmds.find((c) => c.name === "+list");

    const vendor = mockObj({
      id: "vendor-1",
      name: "Blacksmith",
      state: { owner: "player-1", vendor: { inventory: [] } },
    });
    const inStock = mockObj({
      id: "item-1",
      name: "Shield",
      location: "vendor-1",
      state: { price: 10, stock: 3 },
    });
    const outStock = mockObj({
      id: "item-2",
      name: "Helmet",
      location: "vendor-1",
      state: { price: 5, stock: 0 },
    });

    const u = mockU({
      me: { id: "player-1", location: "room-1" },
      dbItems: [vendor, inStock, outStock],
    });

    await listCmd!.exec(u as any);
    const output = u._sent.join("\n");
    assertStringIncludes(output, "Shield");
    assertStringIncludes(output, "Helmet");
    assertStringIncludes(output, "[Out of Stock]");
  });

  it("clones items on buy and decrements stock", async () => {
    const buyCmd = cmds.find((c) => c.name === "+buy");

    const vendor = mockObj({
      id: "vendor-1",
      name: "Blacksmith",
      state: { owner: "player-1", vendor: { inventory: [] } },
    });
    const item = mockObj({
      id: "item-1",
      name: "Dagger",
      location: "vendor-1",
      state: { price: 2, stock: 1 },
    });

    // Mock vendor hooks
    gameHooks.on("vendor:check_funds", (d: any) => {
      d.hasFunds = true;
      d.balance = 100;
    });
    gameHooks.on("vendor:deduct_funds", (d: any) => {
      d.success = true;
      d.balance = 98;
    });

    let purchasedFired = false;
    gameHooks.on("vendor:purchased", (d: any) => {
      assertEquals(d.actorId, "player-2");
      assertEquals(d.vendorId, "vendor-1");
      assertEquals(d.itemName, "Dagger");
      assertEquals(d.price, 2);
      purchasedFired = true;
    });

    const u = mockU({
      me: { id: "player-2", location: "room-1" },
      args: ["Dagger"],
      dbItems: [vendor, item],
    });

    await buyCmd!.exec(u as any);
    assertEquals(item.state.stock, 0);
    assertEquals(purchasedFired, true);

    const boughtItem = u.db.search("player-2");
    // Buyer should now carry a clone
    const player2Items = await u.db.search({ location: "player-2" });
    assertEquals(player2Items.length, 1);
    assertEquals(player2Items[0].name, "Dagger");
  });

  it("modifies stocked item properties using +vendor/set", async () => {
    const setCmd = cmds.find((c) => c.name === "+vendor/set");
    assertEquals(!!setCmd, true);

    const vendor = mockObj({
      id: "vendor-1",
      name: "Blacksmith",
      state: { owner: "player-1", vendor: { inventory: [] } },
    });
    const sword = mockObj({
      id: "sword-1",
      name: "Longsword",
      location: "vendor-1",
      state: { price: 15, stock: 5, description: "Old" },
    });

    const u = mockU({
      me: { id: "player-1", flags: new Set(["player"]) },
      args: ["Blacksmith", "Longsword", "price", "20"],
      dbItems: [vendor, sword],
    });

    const setCalls: any[] = [];
    gameHooks.on("vendor:set", (d: any) => {
      if (d.itemId === "sword-1") {
        setCalls.push({ property: d.property, value: d.value });
      }
    });

    await setCmd!.exec(u as any);
    assertEquals(sword.state.price, 20);

    // Test setting description
    u.cmd.args = ["Blacksmith", "Longsword", "desc", "Very Sharp"];
    await setCmd!.exec(u as any);
    assertEquals(sword.state.description, "Very Sharp");

    // Test setting stock
    u.cmd.args = ["Blacksmith", "Longsword", "stock", "infinite"];
    await setCmd!.exec(u as any);
    assertEquals(sword.state.stock, undefined);

    assertEquals(setCalls.length, 3);
    assertEquals(setCalls[0], { property: "price", value: "20" });
    assertEquals(setCalls[1], { property: "desc", value: "Very Sharp" });
    assertEquals(setCalls[2], { property: "stock", value: "infinite" });
  });

  it("respects VENDORFORMAT override in +list", async () => {
    const listCmd = cmds.find((c) => c.name === "+list");

    const vendor = mockObj({
      id: "vendor-1",
      name: "Blacksmith",
      state: {
        owner: "player-1",
        vendor: { inventory: [] },
        VENDORFORMAT: "Custom Shop View: #item-1",
      },
    });
    const item = mockObj({
      id: "item-1",
      name: "Longsword",
      location: "vendor-1",
      state: { price: 15 },
    });

    const u = mockU({
      me: { id: "player-1", location: "room-1" },
      dbItems: [vendor, item],
    });

    await listCmd!.exec(u as any);
    const output = u._sent.join("\n");
    assertEquals(output, "Custom Shop View: #item-1");
  });
});
