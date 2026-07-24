// Goblin Market DBO CRUD.

import { DBO } from "@ursamu/ursamu";
import type { GoblinMarket, MarketListing } from "./types.ts";
import { findMarketGood } from "./catalog.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

export const marketDb = new DBO<GoblinMarket>("cofd.markets");

export async function createMarket(
  name: string,
  roomId: string,
  createdBy: string,
  maskName?: string,
): Promise<GoblinMarket> {
  const now = Date.now();
  const m: GoblinMarket = {
    id: `mkt-${now}-${Math.floor(Math.random() * 1e6)}`,
    name: name.trim().slice(0, 48),
    maskName: maskName?.trim().slice(0, 48) ||
      "Crowded bazaar",
    roomId,
    open: true,
    listings: defaultListings(),
    createdBy,
    createdAt: now,
  };
  await marketDb.create(m);
  return m;
}

function defaultListings(): MarketListing[] {
  const seeds = [
    "common-fruit",
    "amaranthine",
    "trifle-token",
    "cold-iron-nail",
  ];
  const out: MarketListing[] = [];
  for (const slug of seeds) {
    const g = findMarketGood(slug);
    if (!g) continue;
    out.push({
      slug: g.slug,
      stock: g.defaultStock,
      seller: "A grinning vendor",
    });
  }
  return out;
}

export async function findMarketById(
  id: string,
): Promise<GoblinMarket | null> {
  return (await marketDb.findOne({ id } as Q)) ?? null;
}

export async function findMarketByRoom(
  roomId: string,
): Promise<GoblinMarket | null> {
  const all = await listMarkets();
  return all.find((m) => m.roomId === roomId) ?? null;
}

export async function listMarkets(): Promise<GoblinMarket[]> {
  // deno-lint-ignore no-explicit-any
  return await marketDb.find({} as any);
}

export async function saveMarket(
  m: GoblinMarket,
): Promise<GoblinMarket> {
  await marketDb.atomicModify(m.id, () => m);
  return m;
}

export async function destroyMarket(
  id: string,
): Promise<void> {
  await marketDb.delete({ id } as Q);
}

export function getListing(
  m: GoblinMarket,
  slug: string,
): MarketListing | null {
  const q = slug.toLowerCase().trim();
  return (
    m.listings.find(
      (l) =>
        l.slug === q ||
        l.slug.replace(/-/g, " ") === q,
    ) ?? null
  );
}

export function listingPrices(
  m: GoblinMarket,
  listing: MarketListing,
): { glamour: number; debt: number } {
  const g = findMarketGood(listing.slug);
  return {
    glamour: listing.priceGlamour ?? g?.priceGlamour ?? 1,
    debt: listing.priceDebt ?? g?.priceDebt ?? 0,
  };
}
