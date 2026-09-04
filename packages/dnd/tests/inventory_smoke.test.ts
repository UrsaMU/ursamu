/**
 * Inventory stacking + classification smoke.
 */
import { assertEquals, assert } from "@std/assert";
import {
  dndOf,
  itemKind,
  uniqueById,
} from "../src/commands/inventory-show.ts";
import type { IDBObj } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function thing(
  id: string,
  name: string,
  dnd: Record<string, unknown>,
): IDBObj {
  return {
    id,
    name,
    flags: new Set(["thing"]),
    location: "p1",
    state: { name, dnd },
    contents: [],
  } as unknown as IDBObj;
}

Deno.test("uniqueById drops duplicate ids", OPTS, () => {
  const a = thing("1", "Dagger", { type: "weapon" });
  const out = uniqueById([a, a, { ...a }]);
  assertEquals(out.length, 1);
});

Deno.test("itemKind uses catalog when type missing", OPTS, () => {
  const bare = thing("2", "Longsword", {});
  assertEquals(itemKind(bare), "weapon");
  const armor = thing("3", "Leather Armor", {});
  assertEquals(itemKind(armor), "armor");
});

Deno.test("two daggers are distinct objects by id", OPTS, () => {
  const a = thing("102", "Dagger", {
    type: "weapon",
    damage: "1d4",
    damageType: "piercing",
  });
  const b = thing("103", "Dagger", {
    type: "weapon",
    damage: "1d4",
    damageType: "piercing",
    equipped: true,
  });
  const all = uniqueById([a, b]);
  assertEquals(all.length, 2);
  assert(dndOf(b).equipped);
});
