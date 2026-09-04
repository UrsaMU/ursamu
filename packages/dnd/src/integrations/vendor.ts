/**
 * Vendor gameHooks — D&D gold + gear adapters.
 */
import { gameHooks } from "@ursamu/mush";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import {
  addCoins,
  spendCoins,
  syncGoldField,
} from "../stats/currency.ts";
import {
  applyPriceDiscount,
  readRep,
} from "../world/reputation.ts";
import { resolveGear } from "../data/equipment.ts";
import {
  onAnnotateWares,
  onFormatItem,
  onSpawnItem,
} from "./vendor-gear.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function sheetFrom(obj: Any) {
  const raw = obj?.state?.dnd ?? obj?.data?.dnd;
  return syncGoldField(migrateSheet(raw));
}

async function onCheckFunds(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.actorId });
  const charObj = rows[0];
  if (!charObj) return;
  const raw = charObj?.state?.dnd ?? charObj?.data?.dnd;
  if (!raw) return;
  const sheet = sheetFrom(charObj);
  const before = raw.money;
  const seeded = !before ||
    !(before.cp || before.sp || before.ep || before.gp ||
      before.pp);
  if (seeded && (sheet.gold || 0) > 0) {
    await data.db.modify(data.actorId, "$set", {
      "data.dnd": sheet,
    });
    if (charObj.state) charObj.state.dnd = sheet;
  }
  data.balance = sheet.gold || 0;
  data.hasFunds = (sheet.gold || 0) >= (Number(data.price) || 0);
  data.currency = "gp";
  data._dnd = true;
}

async function onDeductFunds(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.actorId });
  const charObj = rows[0];
  if (!charObj) return;
  const raw = charObj?.state?.dnd ?? charObj?.data?.dnd;
  if (!raw) return;
  const sheet = sheetFrom(charObj);
  const price = Math.floor(Number(data.price) || 0);
  const next = spendCoins(sheet, price, "gp");
  if (!next) {
    data.success = false;
    data.balance = sheet.gold;
    data.currency = "gp";
    data._dnd = true;
    return;
  }
  await data.db.modify(data.actorId, "$set", {
    "data.dnd": next,
  });
  if (charObj.state) charObj.state.dnd = next;
  data.success = true;
  data.balance = next.gold;
  data.currency = "gp";
  data._dnd = true;
}

async function onAddFunds(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.actorId });
  const charObj = rows[0];
  if (!charObj) return;
  const raw = charObj?.state?.dnd ?? charObj?.data?.dnd;
  if (!raw) return;
  const sheet = sheetFrom(charObj);
  const amt = Math.floor(Number(data.amount) || 0);
  const next = addCoins(sheet, amt, "gp");
  await data.db.modify(data.actorId, "$set", {
    "data.dnd": next,
  });
  if (charObj.state) charObj.state.dnd = next;
  data.success = true;
  data.currency = "gp";
  data.balance = next.gold;
  data._dnd = true;
}

async function onCheckEquipped(data: Any): Promise<void> {
  const rows = await data.db.search({ id: data.itemId });
  const item = rows[0];
  if (!item) return;
  const dnd = item.state?.dnd ?? item.data?.dnd;
  if (dnd?.equipped) data.equipped = true;
}

function baseItemPrice(itemDnd: Any): number {
  if (!itemDnd) return 2;
  if (typeof itemDnd.valueGp === "number" && itemDnd.valueGp > 0) {
    return itemDnd.valueGp;
  }
  if (itemDnd.slug) {
    const g = resolveGear("", `slug:${itemDnd.slug}`);
    if (g) return g.priceGp;
  }
  if (itemDnd.type === "weapon") {
    const dmg = String(itemDnd.damage || "1d6");
    let p = dmg.includes("12") || dmg.includes("10")
      ? 30
      : dmg.includes("8")
      ? 15
      : 10;
    if (itemDnd.bonus) p += 200 * Number(itemDnd.bonus);
    return p;
  }
  if (itemDnd.type === "armor") {
    const ac = Number(itemDnd.ac) || 11;
    return ac >= 16 ? 75 : ac >= 14 ? 50 : 10;
  }
  if (itemDnd.type === "shield") {
    return 10 + (Number(itemDnd.bonus) || 0) * 200;
  }
  return 2;
}

function vendorFaction(data: Any): string {
  const v = data.vendor ?? data.shop ?? data.merchant;
  const raw = v?.state?.dndFaction ?? v?.data?.dndFaction ??
    v?.state?.vendor?.faction ?? v?.data?.vendor?.faction ??
    data.faction ?? "";
  const s = String(raw).toLowerCase();
  if (s.includes("mill")) return "millhaven";
  if (s.includes("haven") || s.includes("havenbrook")) {
    return "havenbrook";
  }
  if (s === "millhaven" || s === "havenbrook") return s;
  return s.replace(/-v\d+$/, "") || "havenbrook";
}

async function onGetItemPrice(data: Any): Promise<void> {
  const itemDnd = data.item?.state?.dnd ?? data.item?.data?.dnd;
  let price = baseItemPrice(itemDnd);
  if (data.actorId && data.db?.search && !data.selling) {
    try {
      const rows = await data.db.search({ id: data.actorId });
      const actor = rows[0];
      if (actor) {
        const rep = readRep(actor.state ?? actor.data);
        const fac = vendorFaction(data);
        price = applyPriceDiscount(price, rep[fac] ?? 0);
      }
    } catch (_e: unknown) {
      /* keep base */
    }
  }
  data.price = price;
}

// deno-lint-ignore no-explicit-any
const hooks = gameHooks as any;

export function initVendorHooks(): void {
  hooks.on?.("vendor:format_item", onFormatItem);
  hooks.on?.("vendor:annotate_wares", onAnnotateWares);
  hooks.on?.("vendor:check_funds", onCheckFunds);
  hooks.on?.("vendor:deduct_funds", onDeductFunds);
  hooks.on?.("vendor:add_funds", onAddFunds);
  hooks.on?.("vendor:check_equipped", onCheckEquipped);
  hooks.on?.("vendor:get_item_price", onGetItemPrice);
  hooks.on?.("vendor:spawn_item", onSpawnItem);
}

export function removeVendorHooks(): void {
  hooks.off?.("vendor:format_item", onFormatItem);
  hooks.off?.("vendor:annotate_wares", onAnnotateWares);
  hooks.off?.("vendor:check_funds", onCheckFunds);
  hooks.off?.("vendor:deduct_funds", onDeductFunds);
  hooks.off?.("vendor:add_funds", onAddFunds);
  hooks.off?.("vendor:check_equipped", onCheckEquipped);
  hooks.off?.("vendor:get_item_price", onGetItemPrice);
  hooks.off?.("vendor:spawn_item", onSpawnItem);
}
