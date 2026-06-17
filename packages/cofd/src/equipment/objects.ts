// Equipment items as real UrsaMU game objects.
//
// Each carried item is a Thing created via u.db.create(). It lives in the
// owner's contents (location = ownerId), is visible via look, can be dropped
// into a room, and can be handed between players via the native get/drop/give
// commands.
//
// When equipped the item is flagged "dark" (hidden from look) and its
// state.cofd_item.equippedBy is set to prevent casual drop/give.
// Unequipping removes the dark flag and clears equippedBy.
//
// Sheet still carries equippedWeapon/equippedArmor as IDBObj id pointers
// for O(1) lookup without querying the whole contents list.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import {
  isArmorType,
  isWeaponType,
  lookupItem,
  type WeaponEntry,
  type ArmorEntry,
} from "./catalog.ts";

// -------------------------------------------------------------------
// Per-instance data stored on the object's state field
// -------------------------------------------------------------------

export type ItemKind = "weapon" | "armor" | "gear" | "ammo" | "service";

export type CapacityTag = "high" | "medium" | "low" | "single";

export interface CofdItemData {
  /** Catalog reference key, e.g. "pistol-light". */
  key: string;
  /** Coarse classification used for sectioning and attack-vs-object soak. */
  kind?: ItemKind;
  /** Remaining bullets (firearms only). */
  currentClip?: number;
  /** Optional flavour name override. */
  customLabel?: string;
  /** Free-text note. */
  note?: string;
  /** Set to the wielder's id when equipped; null when in inventory. */
  equippedBy?: string;
  /** Catalog-seeded armor against incoming object damage. */
  durability?: number;
  /** Current hit points; broken when <= 0. */
  structure?: number;
  /** Max hit points; clamp for repair. */
  maxStructure?: number;
  /** True when structure <= 0. Auto-unequips on broken transition. */
  broken?: boolean;
  /** Coarse magazine bucket for ranged weapons. */
  capacityTag?: CapacityTag;
  /** Stack size for ammo items. Undefined for non-ammo. */
  count?: number;
}

/** Return true when the game object is a CoFD item. */
export function isCofdItem(obj: IDBObj): boolean {
  return !!(obj.state?.cofd_item as CofdItemData | undefined)?.key;
}

/** Read item data, backfilling kind/structure for older records. */
export function itemData(obj: IDBObj): CofdItemData | null {
  const d = obj.state?.cofd_item as CofdItemData | undefined;
  if (!d?.key) return null;
  if (d.kind) return d;
  // Backfill kind from catalog lookup for legacy records.
  const resolved = lookupItem(d.key);
  if (!resolved) return d;
  if (resolved.type === "weapon-ranged" || resolved.type === "weapon-melee") {
    return { ...d, kind: "weapon" };
  }
  if (resolved.type === "armor") return { ...d, kind: "armor" };
  if (resolved.type === "service") return { ...d, kind: "service" };
  return { ...d, kind: "gear" };
}

export function displayName(obj: IDBObj): string {
  const d = itemData(obj);
  if (!d) return obj.name ?? "unknown";
  return d.customLabel ?? lookupItem(d.key)?.entry.name ?? d.key;
}

function mapCapacityTag(raw: string | undefined): CapacityTag {
  if (!raw) return "single";
  const v = raw.toLowerCase().trim();
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  if (v === "low") return "low";
  return "single";
}

// -------------------------------------------------------------------
// Lifecycle
// -------------------------------------------------------------------

/**
 * Create a new item as a real game object in the owner's contents.
 * Firearms have their clip filled from the catalog. Ammo merges into an
 * existing stack on the owner when present, including on native get/drop/give
 * via the object:moved hook (see index.ts onObjectMoved).
 */
export async function createItem(
  u: IUrsamuSDK,
  ownerId: string,
  key: string,
  opts: { note?: string; customLabel?: string } = {},
): Promise<IDBObj | null> {
  const resolved = lookupItem(key);
  if (!resolved) return null;

  const entry = resolved.entry as
    & { name: string; size?: number; clip?: number; capacity?: string; durability?: number; structure?: number };

  // Ammo: try to merge into an existing stack on the owner.
  if (resolved.type === "ammo") {
    const existing = await findOwnerAmmoStack(u, ownerId, key);
    if (existing) {
      const d = itemData(existing)!;
      const next = (d.count ?? 1) + 1;
      await u.db.modify(existing.id, "$set", {
        "data.cofd_item": { ...d, count: next },
      });
      return existing;
    }
  }

  let kind: ItemKind;
  if (resolved.type === "weapon-ranged" || resolved.type === "weapon-melee") kind = "weapon";
  else if (resolved.type === "armor") kind = "armor";
  else if (resolved.type === "ammo") kind = "ammo";
  else if (resolved.type === "service") kind = "service";
  else kind = "gear";

  const size = typeof entry.size === "number" ? entry.size : 1;

  let durability = 2;
  let structure = size;
  if (kind === "gear") {
    durability = typeof entry.durability === "number" ? entry.durability : 1;
    structure = typeof entry.structure === "number" ? entry.structure : size;
  } else if (kind === "ammo") {
    durability = 1;
    structure = size;
  }
  const maxStructure = structure;

  const capacityTag = resolved.type === "weapon-ranged"
    ? mapCapacityTag(entry.capacity)
    : undefined;

  const data: CofdItemData = {
    key,
    kind,
    ...(typeof entry.clip === "number" ? { currentClip: entry.clip } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.customLabel ? { customLabel: opts.customLabel } : {}),
    durability,
    structure,
    maxStructure,
    broken: false,
    ...(capacityTag ? { capacityTag } : {}),
    ...(kind === "ammo" ? { count: 1 } : {}),
  };

  const obj = await u.db.create({
    name: opts.customLabel ?? entry.name,
    flags: new Set(["thing"]),
    location: ownerId,
    state: { cofd_item: data },
    contents: [],
  });

  return obj;
}

/** Find an existing ammo stack of `key` on the given owner, if any. */
async function findOwnerAmmoStack(
  u: IUrsamuSDK,
  ownerId: string,
  key: string,
): Promise<IDBObj | null> {
  const all = await u.db.search({ location: ownerId });
  for (const o of all) {
    const d = itemData(o);
    if (d?.kind === "ammo" && d.key === key) return o;
  }
  return null;
}

/**
 * Merge an ammo item into an existing stack when the new owner already has
 * one of the same key. Called from /add and from the object:moved hook
 * (see index.ts onObjectMoved), so native get/drop/give and any future
 * teleport path all collapse stacks automatically.
 */
export async function mergeIfAmmo(
  u: IUrsamuSDK,
  item: IDBObj,
  newOwnerId: string,
): Promise<IDBObj> {
  const d = itemData(item);
  if (!d || d.kind !== "ammo") return item;
  const existing = await findOwnerAmmoStack(u, newOwnerId, d.key);
  if (!existing || existing.id === item.id) return item;
  const ed = itemData(existing)!;
  const merged = (ed.count ?? 1) + (d.count ?? 1);
  await u.db.modify(existing.id, "$set", {
    "data.cofd_item": { ...ed, count: merged },
  });
  await u.db.destroy(item.id);
  return existing;
}

/**
 * Destroy the item permanently (e.g. consumed, disintegrated).
 */
export async function destroyItem(u: IUrsamuSDK, id: string): Promise<void> {
  await u.db.destroy(id);
}

// -------------------------------------------------------------------
// Inventory queries
// -------------------------------------------------------------------

/** All CoFD items the owner currently carries (inventory + equipped). */
export async function carriedItems(
  u: IUrsamuSDK,
  ownerId: string,
): Promise<IDBObj[]> {
  const contents = await u.db.search({ location: ownerId });
  return contents.filter(isCofdItem);
}

/** Items in inventory (not equipped -- equippedBy is unset). */
export async function inventoryItems(
  u: IUrsamuSDK,
  ownerId: string,
): Promise<IDBObj[]> {
  const all = await carriedItems(u, ownerId);
  return all.filter((o) => !(itemData(o)?.equippedBy));
}

/** Items dropped in a room. */
export async function roomItems(
  u: IUrsamuSDK,
  roomId: string,
): Promise<IDBObj[]> {
  const contents = await u.db.search({ location: roomId });
  return contents.filter(isCofdItem);
}

// -------------------------------------------------------------------
// Resolve item references (name OR 1-based slot index)
// -------------------------------------------------------------------

export interface AmbiguousMatch {
  ambiguous: true;
  matches: IDBObj[];
}

export function isAmbiguousMatch(v: unknown): v is AmbiguousMatch {
  return !!v && typeof v === "object" &&
    (v as { ambiguous?: boolean }).ambiguous === true;
}

/**
 * Resolve "ref" against the owner's inventory. If ref parses as a positive
 * integer it is a 1-based slot (exact, never ambiguous). Otherwise it is a
 * case-insensitive substring match against displayName(): returns the single
 * match, an AmbiguousMatch shape when more than one item matches, or null on
 * no match.
 */
export async function resolveItemRef(
  u: IUrsamuSDK,
  ownerId: string,
  ref: string,
): Promise<IDBObj | AmbiguousMatch | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const inv = await inventoryItems(u, ownerId);
  const asInt = parseInt(trimmed, 10);
  if (Number.isInteger(asInt) && String(asInt) === trimmed && asInt >= 1) {
    return inv[asInt - 1] ?? null;
  }
  const needle = trimmed.toLowerCase();
  const matches: IDBObj[] = [];
  for (const o of inv) {
    if (displayName(o).toLowerCase().includes(needle)) matches.push(o);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return { ambiguous: true, matches };
}

// -------------------------------------------------------------------
// Equip / unequip
// -------------------------------------------------------------------

export interface EquipResult {
  equippedId: string;
  slot: "weapon" | "armor";
  error?: undefined;
}
export interface EquipError {
  error: string;
  equippedId?: undefined;
  slot?: undefined;
}

/**
 * Equip the item at the given 1-based inventory index.
 * - Moves any previously-equipped item in the same slot back to inventory.
 * - Sets "dark" flag on the newly equipped item.
 * - Stamps equippedBy on the item state.
 * Returns the item id and slot, or an error.
 */
export async function equipItem(
  u: IUrsamuSDK,
  ownerId: string,
  oneBasedIndex: number,
  currentEquippedWeapon: string | null,
  currentEquippedArmor: string | null,
): Promise<EquipResult | EquipError> {
  const inv = await inventoryItems(u, ownerId);
  const idx = oneBasedIndex - 1;
  if (idx < 0 || idx >= inv.length) {
    return { error: `No inventory slot ${oneBasedIndex}.` };
  }
  const item = inv[idx];
  const d = itemData(item)!;
  const resolved = lookupItem(d.key);
  if (!resolved) return { error: `Item '${d.key}' missing from catalog.` };

  if (isWeaponType(resolved.type)) {
    if (currentEquippedWeapon) await unequipById(u, currentEquippedWeapon);
    await applyEquipped(u, item.id, ownerId);
    return { equippedId: item.id, slot: "weapon" };
  }
  if (isArmorType(resolved.type)) {
    if (currentEquippedArmor) await unequipById(u, currentEquippedArmor);
    await applyEquipped(u, item.id, ownerId);
    return { equippedId: item.id, slot: "armor" };
  }
  return { error: `'${resolved.entry.name}' is not a weapon or armor.` };
}

async function applyEquipped(
  u: IUrsamuSDK,
  itemId: string,
  ownerId: string,
): Promise<void> {
  await u.setFlags(itemId, "dark");
  const item = (await u.db.search({ id: itemId }))[0];
  if (!item) return;
  const d: CofdItemData = { ...(itemData(item) ?? { key: "" }), equippedBy: ownerId };
  await u.db.modify(itemId, "$set", { "data.cofd_item": d });
}

async function unequipById(u: IUrsamuSDK, itemId: string): Promise<void> {
  await u.setFlags(itemId, "!dark");
  const item = (await u.db.search({ id: itemId }))[0];
  if (!item) return;
  const d: CofdItemData = { ...(itemData(item) ?? { key: "" }) };
  delete d.equippedBy;
  await u.db.modify(itemId, "$set", { "data.cofd_item": d });
}

/** Unequip the given slot id. Removes dark flag and equippedBy. */
export async function unequipItem(u: IUrsamuSDK, itemId: string): Promise<void> {
  await unequipById(u, itemId);
}

// -------------------------------------------------------------------
// Ammo
// -------------------------------------------------------------------

/**
 * Decrement a firearm's clip by `shots`.
 * Returns new clip count, or null if not a firearm or out of ammo.
 */
export async function fireShots(
  u: IUrsamuSDK,
  itemId: string,
  shots: number,
): Promise<number | null> {
  const items = await u.db.search({ id: itemId });
  const item = items[0];
  if (!item) return null;
  const d = itemData(item);
  if (!d || typeof d.currentClip !== "number") return null;
  if (d.currentClip < shots) return null;
  const next = d.currentClip - shots;
  await u.db.modify(itemId, "$set", { "data.cofd_item": { ...d, currentClip: next } });
  return next;
}

/** Refill a firearm's clip from the catalog (no ammo bookkeeping). */
export async function reloadItem(u: IUrsamuSDK, itemId: string): Promise<boolean> {
  const items = await u.db.search({ id: itemId });
  const item = items[0];
  if (!item) return false;
  const d = itemData(item);
  if (!d) return false;
  const resolved = lookupItem(d.key);
  if (!resolved || !isWeaponType(resolved.type)) return false;
  const clip = (resolved.entry as { clip?: number }).clip;
  if (typeof clip !== "number") return false;
  await u.db.modify(itemId, "$set", { "data.cofd_item": { ...d, currentClip: clip } });
  return true;
}

// -------------------------------------------------------------------
// Ammo stacks
// -------------------------------------------------------------------

/**
 * Split `n` rounds off an ammo stack, producing a new stack of `n` and
 * leaving the original at count - n. Invariant: 1 <= n < count.
 * Returns the new stack's id, or an error string.
 */
export async function splitStack(
  u: IUrsamuSDK,
  itemId: string,
  n: number,
): Promise<string | { error: string }> {
  const items = await u.db.search({ id: itemId });
  const item = items[0];
  if (!item) return { error: "Stack not found." };
  const d = itemData(item);
  if (!d || d.kind !== "ammo") return { error: "Not an ammo stack." };
  const count = d.count ?? 1;
  if (!Number.isInteger(n) || n < 1) return { error: "Split count must be >= 1." };
  if (n >= count) return { error: `Cannot split ${n} from stack of ${count}.` };

  await u.db.modify(itemId, "$set", {
    "data.cofd_item": { ...d, count: count - n },
  });

  const ownerId = item.location ?? "";
  const newObj = await u.db.create({
    name: item.name,
    flags: new Set(["thing"]),
    location: ownerId,
    state: { cofd_item: { ...d, count: n } },
    contents: [],
  });
  return newObj.id;
}

/**
 * Consume one ammo stack of the weapon's matching forWeaponKeys, decrementing
 * count and destroying the stack at 0. Refills the weapon's currentClip to
 * the catalog clip. Returns ok/error result.
 */
export async function consumeReload(
  u: IUrsamuSDK,
  ownerId: string,
  weaponItem: IDBObj,
): Promise<{ ok: boolean; error?: string; ammoKey?: string }> {
  const wd = itemData(weaponItem);
  if (!wd) return { ok: false, error: "Not a CoFD item." };
  const resolved = lookupItem(wd.key);
  if (!resolved || resolved.type !== "weapon-ranged") {
    return { ok: false, error: "Not a firearm." };
  }
  const clip = (resolved.entry as { clip?: number }).clip;
  if (typeof clip !== "number") return { ok: false, error: "Weapon has no clip." };

  const all = await u.db.search({ location: ownerId });
  let stack: IDBObj | null = null;
  let stackData: CofdItemData | null = null;
  let ammoResolved: { forWeaponKeys: string[] } | null = null;
  for (const o of all) {
    const d = itemData(o);
    if (!d || d.kind !== "ammo") continue;
    const r = lookupItem(d.key);
    if (!r || r.type !== "ammo") continue;
    const ammoEntry = r.entry as { forWeaponKeys?: string[] };
    if (!ammoEntry.forWeaponKeys?.includes(wd.key)) continue;
    stack = o;
    stackData = d;
    ammoResolved = { forWeaponKeys: ammoEntry.forWeaponKeys };
    break;
  }
  if (!stack || !stackData || !ammoResolved) {
    return { ok: false, error: "no-stack" };
  }

  const count = stackData.count ?? 1;
  if (count <= 1) {
    await u.db.destroy(stack.id);
  } else {
    await u.db.modify(stack.id, "$set", {
      "data.cofd_item": { ...stackData, count: count - 1 },
    });
  }

  await u.db.modify(weaponItem.id, "$set", {
    "data.cofd_item": { ...wd, currentClip: clip },
  });

  return { ok: true, ammoKey: stackData.key };
}

// -------------------------------------------------------------------
// Damage / repair on items
// -------------------------------------------------------------------

export interface DamageResult {
  newStructure: number;
  broken: boolean;
  autoUnequipped: boolean;
  slot?: "weapon" | "armor";
}

/**
 * Apply n raw points of damage to the item. Damage is NOT soaked here -- the
 * caller should subtract durability already. We clamp structure at 0; when
 * structure hits 0 we flip broken=true and force-unequip from the owner's
 * sheet (clear equippedBy, drop the dark flag, clear sheet pointer).
 */
export async function damageItem(
  u: IUrsamuSDK,
  itemId: string,
  n: number,
): Promise<DamageResult> {
  const items = await u.db.search({ id: itemId });
  const item = items[0];
  if (!item) return { newStructure: 0, broken: false, autoUnequipped: false };
  const d = itemData(item);
  if (!d) return { newStructure: 0, broken: false, autoUnequipped: false };
  const max = d.maxStructure ?? d.structure ?? 1;
  const cur = d.structure ?? max;
  const next = Math.max(0, cur - Math.max(0, n));
  const broken = next <= 0;
  const wasEquipped = !!d.equippedBy;

  let autoUnequipped = false;
  let slot: "weapon" | "armor" | undefined;

  const newData: CofdItemData = { ...d, structure: next, broken };

  if (broken && wasEquipped) {
    // Drop dark flag, clear equippedBy.
    await u.setFlags(itemId, "!dark");
    delete newData.equippedBy;

    // Clear sheet pointer on the owner.
    const ownerId = d.equippedBy!;
    const owner = (await u.db.search({ id: ownerId }))[0];
    if (owner) {
      const sheet = owner.state?.cofd as
        | { equipment?: { equippedWeapon?: string | null; equippedArmor?: string | null } }
        | undefined;
      const eq = sheet?.equipment ?? { equippedWeapon: null, equippedArmor: null };
      if (eq.equippedWeapon === itemId) {
        slot = "weapon";
        await u.db.modify(ownerId, "$set", {
          "data.cofd": { ...sheet, equipment: { ...eq, equippedWeapon: null } },
        });
        autoUnequipped = true;
      } else if (eq.equippedArmor === itemId) {
        slot = "armor";
        await u.db.modify(ownerId, "$set", {
          "data.cofd": { ...sheet, equipment: { ...eq, equippedArmor: null } },
        });
        autoUnequipped = true;
      }
    }
  }

  await u.db.modify(itemId, "$set", { "data.cofd_item": newData });
  return { newStructure: next, broken, autoUnequipped, slot };
}

export interface RepairResult {
  newStructure: number;
  repaired: boolean;
}

/** Repair n points; clamp at maxStructure; clear broken when structure > 0. */
export async function repairItem(
  u: IUrsamuSDK,
  itemId: string,
  n: number,
): Promise<RepairResult> {
  const items = await u.db.search({ id: itemId });
  const item = items[0];
  if (!item) return { newStructure: 0, repaired: false };
  const d = itemData(item);
  if (!d) return { newStructure: 0, repaired: false };
  const max = d.maxStructure ?? d.structure ?? 1;
  const cur = d.structure ?? 0;
  const next = Math.min(max, cur + Math.max(0, n));
  const broken = next <= 0;
  const newData: CofdItemData = { ...d, structure: next, broken };
  await u.db.modify(itemId, "$set", { "data.cofd_item": newData });
  return { newStructure: next, repaired: next > cur };
}

// -------------------------------------------------------------------
// Helpers for commands
// -------------------------------------------------------------------

/** Resolve the catalog entry for an equipped weapon + the item object, or null. */
export async function equippedWeaponEntry(
  u: IUrsamuSDK,
  equippedWeaponId: string | null,
): Promise<{ obj: IDBObj; entry: WeaponEntry; data: CofdItemData } | null> {
  if (!equippedWeaponId) return null;
  const items = await u.db.search({ id: equippedWeaponId });
  const obj = items[0];
  if (!obj) return null;
  const d = itemData(obj);
  if (!d) return null;
  const resolved = lookupItem(d.key);
  if (!resolved || !isWeaponType(resolved.type)) return null;
  return { obj, entry: resolved.entry as WeaponEntry, data: d };
}

/** Resolve the catalog entry for equipped armor + the item object, or null. */
export async function equippedArmorEntry(
  u: IUrsamuSDK,
  equippedArmorId: string | null,
): Promise<{ obj: IDBObj; entry: ArmorEntry; data: CofdItemData } | null> {
  if (!equippedArmorId) return null;
  const items = await u.db.search({ id: equippedArmorId });
  const obj = items[0];
  if (!obj) return null;
  const d = itemData(obj);
  if (!d) return null;
  const resolved = lookupItem(d.key);
  if (!resolved || !isArmorType(resolved.type)) return null;
  return { obj, entry: resolved.entry as ArmorEntry, data: d };
}
