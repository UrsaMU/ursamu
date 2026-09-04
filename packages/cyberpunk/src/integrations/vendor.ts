/**
 * Vendor gameHooks — CPR eurodollars + gear adapters.
 */
import { gameHooks } from "@ursamu/mush";
import type { ICPRCharacter, IGearItem } from
  "../../db/schemas.ts";
import { getWeapon } from "../../data/weapons.ts";
import { ARMOR_CATALOG } from "../../data/armor.ts";
import { CYBERWARE_CATALOG } from "../../data/cyberware.ts";
import { priceToEB } from "../../engine/dice.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function cprFrom(obj: Any): ICPRCharacter | null {
  const raw = obj?.state?.cpr ?? obj?.data?.cpr;
  if (!raw || typeof raw !== "object") return null;
  return raw as ICPRCharacter;
}

function ebOf(cpr: ICPRCharacter): number {
  return Math.max(0, Math.floor(Number(cpr.eurodollars) || 0));
}

async function onCheckFunds(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.actorId });
  const charObj = rows[0];
  if (!charObj) return;
  const cpr = cprFrom(charObj);
  if (!cpr) return;
  const bal = ebOf(cpr);
  data.balance = bal;
  data.hasFunds = bal >= (Number(data.price) || 0);
  data.currency = "eb";
  data._cpr = true;
}

async function onDeductFunds(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.actorId });
  const charObj = rows[0];
  if (!charObj) return;
  const cpr = cprFrom(charObj);
  if (!cpr) return;
  const price = Math.floor(Number(data.price) || 0);
  const bal = ebOf(cpr);
  if (bal < price) {
    data.success = false;
    data.balance = bal;
    data.currency = "eb";
    data._cpr = true;
    return;
  }
  const next = { ...cpr, eurodollars: bal - price };
  await data.db.modify(data.actorId, "$set", {
    "state.cpr": next,
  });
  if (charObj.state) charObj.state.cpr = next;
  data.success = true;
  data.balance = next.eurodollars;
  data.currency = "eb";
  data._cpr = true;
}

async function onAddFunds(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.actorId });
  const charObj = rows[0];
  if (!charObj) return;
  const cpr = cprFrom(charObj);
  if (!cpr) return;
  const amt = Math.floor(Number(data.amount) || 0);
  const next = {
    ...cpr,
    eurodollars: ebOf(cpr) + Math.max(0, amt),
  };
  await data.db.modify(data.actorId, "$set", {
    "state.cpr": next,
  });
  if (charObj.state) charObj.state.cpr = next;
  data.success = true;
  data.currency = "eb";
  data.balance = next.eurodollars;
  data._cpr = true;
}

async function onCheckEquipped(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.itemId });
  const item = rows[0];
  if (!item) return;
  const cpr = item.state?.cpr ?? item.data?.cpr;
  if (cpr?.equipped) data.equipped = true;
}

function catalogPrice(slug: string): number | null {
  const key = slug.toLowerCase().replace(/\s+/g, "_");
  const w = getWeapon(key) ?? getWeapon(slug);
  if (w) return w.costEb ?? priceToEB(w.priceCategory);
  const armor = ARMOR_CATALOG.find((a) =>
    a.name.toLowerCase().replace(/\s+/g, "_") === key ||
    a.name.toLowerCase() === slug.toLowerCase()
  );
  if (armor) {
    return armor.costEb ?? priceToEB(armor.priceCategory);
  }
  const chrome = CYBERWARE_CATALOG.find((c) =>
    c.name.toLowerCase().replace(/\s+/g, "_") === key ||
    c.name.toLowerCase() === slug.toLowerCase()
  );
  if (chrome) {
    return priceToEB(chrome.priceCategory);
  }
  return null;
}

async function onGetItemPrice(data: Any): Promise<void> {
  const item = data.item;
  const cpr = item?.state?.cpr ?? item?.data?.cpr;
  if (typeof cpr?.costEb === "number" && cpr.costEb > 0) {
    data.price = cpr.costEb;
    return;
  }
  const slug = String(
    cpr?.slug ?? cpr?.name ?? item?.name ?? "",
  );
  const cat = catalogPrice(slug);
  if (cat != null) {
    data.price = cat;
    return;
  }
  if (typeof data.price === "number" && data.price > 0) return;
  data.price = 50;
}

async function onFormatItem(data: Any): Promise<void> {
  const item = data.item;
  const cpr = item?.state?.cpr ?? item?.data?.cpr;
  if (!cpr) return;
  const name = cpr.name ?? item?.name ?? "item";
  const cost = cpr.costEb ?? data.price ?? "?";
  data.line = `${name} — ${cost} eb`;
}

async function onSpawnItem(data: Any): Promise<void> {
  if (!data.actorId || !data.db?.search) return;
  const rows = await data.db.search({ id: data.actorId });
  const charObj = rows[0];
  const cpr = cprFrom(charObj);
  if (!cpr || !charObj) return;

  const raw = data.item ?? data.ware ?? {};
  const name = String(
    raw.name ?? raw.slug ?? data.slug ?? "item",
  ).slice(0, 64);
  const gear: IGearItem = {
    id: crypto.randomUUID(),
    name,
    type: "gear",
    slot: "carried",
    concealed: false,
    description: String(raw.description ?? raw.notes ?? "")
      .slice(0, 200),
  };
  const next: ICPRCharacter = {
    ...cpr,
    gear: [...(cpr.gear ?? []), gear],
  };
  await data.db.modify(data.actorId, "$set", {
    "state.cpr": next,
  });
  if (charObj.state) charObj.state.cpr = next;
  data.spawned = true;
  data._cprGear = gear.id;
}

// deno-lint-ignore no-explicit-any
const hooks = gameHooks as any;

export function initVendorHooks(): void {
  hooks.on?.("vendor:format_item", onFormatItem);
  hooks.on?.("vendor:check_funds", onCheckFunds);
  hooks.on?.("vendor:deduct_funds", onDeductFunds);
  hooks.on?.("vendor:add_funds", onAddFunds);
  hooks.on?.("vendor:check_equipped", onCheckEquipped);
  hooks.on?.("vendor:get_item_price", onGetItemPrice);
  hooks.on?.("vendor:spawn_item", onSpawnItem);
}

export function removeVendorHooks(): void {
  hooks.off?.("vendor:format_item", onFormatItem);
  hooks.off?.("vendor:check_funds", onCheckFunds);
  hooks.off?.("vendor:deduct_funds", onDeductFunds);
  hooks.off?.("vendor:add_funds", onAddFunds);
  hooks.off?.("vendor:check_equipped", onCheckEquipped);
  hooks.off?.("vendor:get_item_price", onGetItemPrice);
  hooks.off?.("vendor:spawn_item", onSpawnItem);
}
