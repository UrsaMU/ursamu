import { assert, assertEquals } from "@std/assert";
import {
  personalGearItems,
} from "../engine/items.ts";
import type { IDBObj } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function thing(
  name: string,
  kind: string,
  id: string,
): IDBObj {
  return {
    id,
    name,
    flags: new Set(["thing"]),
    location: "p1",
    contents: [],
    state: {
      sprawl_item: {
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        kind,
        load: 1,
        slot: "carried",
      },
    },
  } as unknown as IDBObj;
}

Deno.test("personalGearItems skips vehicles", OPTS, () => {
  const items = [
    thing("PKD", "firearm", "1"),
    thing("Bike", "vehicle", "2"),
    thing("Vest", "armor", "3"),
    thing("Part", "vehicle-mod", "4"),
  ];
  const g = personalGearItems(items);
  assertEquals(g.length, 2);
  assertEquals(g[0].name, "PKD");
  assertEquals(g[1].name, "Vest");
});

Deno.test("equip help module loads", OPTS, async () => {
  // Side-effect import registers wear/wield/stow
  await import("../commands/gear-slots.ts");
  assert(true);
});
