// Goblin fruit as real game objects (cofd_item kind goblin-fruit).

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  destroyItem,
  itemData,
  type CofdItemData,
} from "../equipment/objects.ts";
import {
  findFruit,
  type GoblinFruit,
} from "./fruit_catalog.ts";

export function isFruitObj(obj: IDBObj): boolean {
  return itemData(obj)?.kind === "goblin-fruit";
}

export function fruitSlug(obj: IDBObj): string | null {
  const d = itemData(obj);
  if (!d || d.kind !== "goblin-fruit") return null;
  return d.key;
}

export function fruitGotAt(obj: IDBObj): number {
  return itemData(obj)?.gotAt ?? 0;
}

/** True name (Lost); maskName for mortals when perception lands. */
export function fruitDisplayName(obj: IDBObj): string {
  const d = itemData(obj);
  if (!d || d.kind !== "goblin-fruit") return obj.name ?? "fruit";
  if (d.customLabel) return d.customLabel;
  return findFruit(d.key)?.name ?? d.key;
}

export function fruitMaskName(obj: IDBObj): string {
  const d = itemData(obj);
  if (d?.maskName) return d.maskName;
  return "Strange fruit";
}

export async function listFruitObjects(
  u: IUrsamuSDK,
  ownerId: string,
): Promise<IDBObj[]> {
  const contents = await u.db.search({ location: ownerId });
  return contents.filter(isFruitObj);
}

export async function countFruitObjects(
  u: IUrsamuSDK,
  ownerId: string,
  slug?: string,
): Promise<number> {
  const all = await listFruitObjects(u, ownerId);
  if (!slug) {
    let n = 0;
    for (const o of all) n += itemData(o)?.count ?? 1;
    return n;
  }
  const q = slug.toLowerCase().trim();
  let n = 0;
  for (const o of all) {
    const s = fruitSlug(o) ?? "";
    if (s === q || s.replace(/-/g, " ") === q) {
      n += itemData(o)?.count ?? 1;
    }
  }
  return n;
}

export async function createFruitObject(
  u: IUrsamuSDK,
  ownerId: string,
  slug: string,
  now: number = Date.now(),
): Promise<IDBObj | null> {
  const meta = findFruit(slug);
  if (!meta) return null;

  const existing = await findFruitStack(u, ownerId, meta.slug);
  if (existing) {
    const d = itemData(existing)!;
    const next = (d.count ?? 1) + 1;
    await u.db.modify(existing.id, "$set", {
      "data.cofd_item": {
        ...d,
        count: next,
        gotAt: d.gotAt ?? now,
      },
    });
    return existing;
  }

  const data: CofdItemData = {
    key: meta.slug,
    kind: "goblin-fruit",
    customLabel: meta.name,
    maskName: maskLabelFor(meta),
    gotAt: now,
    count: 1,
    durability: 1,
    structure: 1,
    maxStructure: 1,
    broken: false,
  };

  return await u.db.create({
    name: meta.name,
    flags: new Set(["thing"]),
    location: ownerId,
    state: { cofd_item: data },
    contents: [],
  });
}

function maskLabelFor(meta: GoblinFruit): string {
  if (meta.rarity === "oddment") return "Odd scrap of plant";
  if (meta.rarity === "exceptional") return "Unusual fruit";
  return "Strange fruit";
}

async function findFruitStack(
  u: IUrsamuSDK,
  ownerId: string,
  slug: string,
): Promise<IDBObj | null> {
  const all = await listFruitObjects(u, ownerId);
  for (const o of all) {
    if (fruitSlug(o) === slug) return o;
  }
  return null;
}

export async function consumeFruitObject(
  u: IUrsamuSDK,
  ownerId: string,
  slug: string,
): Promise<{ ok: boolean; fruit: GoblinFruit | null }> {
  const meta = findFruit(slug);
  if (!meta) return { ok: false, fruit: null };
  const stack = await findFruitStack(u, ownerId, meta.slug);
  if (!stack) return { ok: false, fruit: null };
  const d = itemData(stack)!;
  const count = d.count ?? 1;
  if (count <= 1) {
    await destroyItem(u, stack.id);
  } else {
    await u.db.modify(stack.id, "$set", {
      "data.cofd_item": { ...d, count: count - 1 },
    });
  }
  return { ok: true, fruit: meta };
}
