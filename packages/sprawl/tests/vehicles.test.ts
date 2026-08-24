import { assertEquals, assert } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  buildItemData,
  createItem,
  itemData,
  loadFromItems,
} from "../engine/items.ts";
import {
  attachMod,
  detachMod,
} from "../engine/item-mods.ts";
import {
  applyHullDamage,
  effectiveVehicleDs,
  listOccupants,
  resolveOccupantFire,
  seatOccupant,
  unseatOccupant,
  vehicleActionBonus,
  vehicleIsArmoured,
  vehicleLabel,
  vehicleModSourceFromRow,
  vehicleSourceFromRow,
} from "../engine/vehicles.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockUWithStore() {
  const objs: IDBObj[] = [];
  const u = {
    me: { id: "p1" } as IDBObj,
    db: {
      create: async (t: Partial<IDBObj>) => {
        const o = {
          id: `t${objs.length + 1}`,
          name: t.name ?? "x",
          flags: t.flags ?? new Set(["thing"]),
          location: t.location ?? "p1",
          state: t.state ?? {},
          contents: [],
        } as IDBObj;
        objs.push(o);
        return o;
      },
      search: async (q: Record<string, unknown>) => {
        if (q.location) {
          return objs.filter((o) => o.location === q.location);
        }
        return objs;
      },
      modify: async (
        id: string,
        _op: string,
        fields: Record<string, unknown>,
      ) => {
        const o = objs.find((x) => x.id === id);
        if (!o) return;
        for (const [path, val] of Object.entries(fields)) {
          if (
            path === "data.sprawl_item" ||
            path === "state.sprawl_item"
          ) {
            o.state = { ...o.state, sprawl_item: val };
          }
        }
      },
      destroy: async (id: string) => {
        const i = objs.findIndex((o) => o.id === id);
        if (i >= 0) objs.splice(i, 1);
      },
    },
    send: () => {},
  };
  return { u: u as unknown as IUrsamuSDK, objs };
}

Deno.test("vehicle source has ds and load 0", OPTS, () => {
  const d = buildItemData(vehicleSourceFromRow({
    slug: "tanksuit",
    name: "Tanksuit",
    ds: 14,
  }));
  assertEquals(d.kind, "vehicle");
  assertEquals(d.load, 0);
  assertEquals(d.ds, 14);
  assertEquals(d.chassis, "tanksuit");
});

Deno.test("vehicles do not add personal load", OPTS, () => {
  const items = [
    buildItemData({ slug: "gun", kind: "firearm", load: 2 }),
    buildItemData(vehicleSourceFromRow({
      slug: "walker",
      name: "Walker",
      ds: 16,
    })),
  ];
  assertEquals(loadFromItems(items), 2);
});

Deno.test("tough and fragile change hull DS", OPTS, () => {
  const d = buildItemData(vehicleSourceFromRow({
    slug: "ground-car",
    name: "Car",
    ds: 12,
  }));
  d.mods = [
    { slug: "tough", name: "Tough", bonus: 1, tags: ["ds"] },
    { slug: "tough", name: "Tough", bonus: 1, tags: ["ds"] },
    { slug: "fragile", name: "Fragile", bonus: -1, tags: ["ds"] },
  ];
  // two tough +1 each capped conceptually per-install; sum +2-1
  assertEquals(effectiveVehicleDs(d), 13);
});

Deno.test("vehicleActionBonus drive and fast", OPTS, () => {
  const d = buildItemData(vehicleSourceFromRow({
    slug: "rider",
    name: "Rider",
    ds: 12,
  }));
  d.mods = [
    {
      slug: "cybercontrol-rig",
      name: "Cybercontrol Rig",
      bonus: 1,
      tags: ["drive", "chase"],
    },
    {
      slug: "crazy-fast",
      name: "Crazy Fast",
      tags: ["fast", "chase"],
    },
    {
      slug: "spoiler-alert",
      name: "Spoiler Alert",
      bonus: 1,
      tags: ["drive"],
    },
  ];
  const drive = vehicleActionBonus(d, ["drive"]);
  assertEquals(drive.total, 2);
  assertEquals(drive.faster, true);
  const chase = vehicleActionBonus(d, ["chase"]);
  assertEquals(chase.total, 1); // cyber only (+ drive tags on chase list)
  assert(chase.faster);
});

Deno.test("applyHullDamage reduces DS", OPTS, () => {
  const d = buildItemData(vehicleSourceFromRow({
    slug: "limo",
    name: "Limo",
    ds: 12,
  }));
  const hit = applyHullDamage(d, 4);
  assertEquals(hit.before, 12);
  assertEquals(hit.after, 8);
  assertEquals(hit.data.ds, 8);
  assertEquals(hit.destroyed, false);
  const wreck = applyHullDamage(hit.data, 20);
  assertEquals(wreck.destroyed, true);
  assertEquals(wreck.after, 0);
});

Deno.test("combat bonus from mecha bay", OPTS, () => {
  const d = buildItemData(vehicleSourceFromRow({
    slug: "tanksuit",
    name: "Tanksuit",
    ds: 14,
  }));
  d.mods = [
    {
      slug: "mecha-weapons-bay",
      name: "Mecha Weapons Bay",
      bonus: 1,
      tags: ["combat", "mecha"],
    },
    {
      slug: "armoured-combat",
      name: "Armoured",
      tags: ["armour"],
    },
  ];
  const c = vehicleActionBonus(d, ["combat", "mecha"]);
  assertEquals(c.total, 1);
  assertEquals(vehicleIsArmoured(d), true);
});

Deno.test("attach vehicle-mod to tanksuit mecha", OPTS, async () => {
  const { u, objs } = mockUWithStore();
  const hull = await createItem(
    u,
    "p1",
    vehicleSourceFromRow({
      slug: "tanksuit",
      name: "M-94 Tanksuit",
      ds: 14,
    }),
  );
  const frame = await createItem(
    u,
    "p1",
    vehicleModSourceFromRow({
      slug: "mecha-frame",
      name: "Mecha Frame",
      bonus: 1,
      tags: ["drive", "mecha"],
      host: ["vehicle"],
      chassis: ["tanksuit", "walker"],
    }),
  );
  assert(hull && frame);
  const r = await attachMod(
    u,
    "p1",
    "tanksuit",
    "mecha-frame",
    { vehicle: true },
  );
  assert(r.ok);
  assertEquals(objs.length, 1);
  const d = itemData(objs[0])!;
  assertEquals(d.mods?.length, 1);
  assert(vehicleLabel(objs[0]).includes("1 mod"));
  const drive = vehicleActionBonus(d, ["drive"]);
  assertEquals(drive.total, 1);

  const det = await detachMod(
    u,
    "p1",
    "tanksuit",
    "mecha-frame",
    { vehicle: true },
  );
  assert(det.ok);
  assertEquals(objs.length, 2);
  assertEquals(itemData(objs[1])?.kind, "vehicle-mod");
});

Deno.test("occupants take fire vs attack total", OPTS, () => {
  let d = buildItemData(vehicleSourceFromRow({
    slug: "limo",
    name: "Corp Limo",
    ds: 12,
  }));
  d = seatOccupant(d, {
    name: "Exec",
    ds: 10,
    role: "passenger",
  });
  d = seatOccupant(d, {
    name: "Driver",
    ds: 12,
    role: "driver",
  });
  d = seatOccupant(d, {
    name: "Guard",
    ds: 14,
    role: "gunner",
  });
  assertEquals(listOccupants(d).length, 3);
  assert(vehicleLabel({
    id: "v",
    name: "Corp Limo",
    flags: new Set(["thing"]),
    state: { sprawl_item: d },
    contents: [],
  } as unknown as IDBObj).includes("3 aboard"));

  // Book example: total 16 vs limo crew
  const fire = resolveOccupantFire(d, 16);
  assertEquals(fire.lines.length, 3);
  const exec = fire.lines.find((l) => l.name === "Exec")!;
  assertEquals(exec.hit, true);
  assertEquals(exec.afterDs, 4); // 10 - 6
  const guard = fire.lines.find((l) => l.name === "Guard")!;
  assertEquals(guard.hit, true);
  assertEquals(guard.afterDs, 12); // 14 - 2
  // Driver 12 → 8
  assertEquals(
    fire.data.occupants?.find((o) => o.name === "Driver")?.ds,
    8,
  );

  const gone = unseatOccupant(fire.data, "Exec");
  assert(gone.removed?.name === "Exec");
});

Deno.test("weapon mod rejects vehicle host", OPTS, async () => {
  const { u } = mockUWithStore();
  await createItem(
    u,
    "p1",
    vehicleSourceFromRow({ slug: "bike", name: "Bike", ds: 10 }),
  );
  await createItem(u, "p1", {
    slug: "silencer",
    name: "Silencer",
    kind: "mod",
    load: 0,
    hostKinds: ["firearm"],
  });
  const r = await attachMod(u, "p1", "bike", "silencer", {
    vehicle: true,
  });
  assertEquals(r.ok, false);
});
