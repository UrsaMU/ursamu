// Pure resolve purchase (pay Glamour or take Debt).

import type { CofdSheet } from "../stats/sheet.ts";
import { createFruitObject } from "../hedge/fruit_objects.ts";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import { findMarketGood } from "./catalog.ts";
import { addDebt } from "./debt.ts";
import {
  getListing,
  listingPrices,
  saveMarket,
} from "./db.ts";
import type {
  GoblinDebt,
  GoblinMarket,
  MarketGood,
  PayMode,
} from "./types.ts";

export interface BuyResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  market?: GoblinMarket;
  good?: MarketGood;
  debt?: GoblinDebt;
  lines: string[];
  /** Spawn fruit object after pure path. */
  fruitSlug?: string;
  tokenNote?: string;
}

export function resolveBuy(
  sheet: CofdSheet,
  market: GoblinMarket,
  slug: string,
  mode: PayMode,
  now: number = Date.now(),
): BuyResult {
  if (!market.open) {
    return {
      ok: false,
      reason: "This market is closed.",
      lines: [],
    };
  }
  const listing = getListing(market, slug);
  if (!listing) {
    return {
      ok: false,
      reason: `No listing '${slug}' here.`,
      lines: [],
    };
  }
  if (listing.stock === 0) {
    return {
      ok: false,
      reason: "Sold out.",
      lines: [],
    };
  }
  const good = findMarketGood(listing.slug);
  if (!good) {
    return {
      ok: false,
      reason: `Unknown good '${listing.slug}'.`,
      lines: [],
    };
  }
  const prices = listingPrices(market, listing);
  let nextSheet = sheet;
  let debt: GoblinDebt | undefined;
  const lines: string[] = [];

  if (mode === "glamour") {
    const cost = prices.glamour;
    const g = nextSheet.energyCurrent ?? 0;
    if (g < cost) {
      return {
        ok: false,
        reason:
          `Need ${cost} Glamour (have ${g}). ` +
          "Try +market/buy <slug> debt",
        lines: [],
      };
    }
    nextSheet = {
      ...nextSheet,
      energyCurrent: g - cost,
    };
    lines.push(
      `Paid ${cost} Glamour for %cy${good.name}%cn.`,
    );
  } else {
    const sev = prices.debt;
    if (sev < 1) {
      return {
        ok: false,
        reason: `${good.name} is cash-only (Glamour).`,
        lines: [],
      };
    }
    const r = addDebt(nextSheet, {
      to: listing.seller ?? "Goblin vendor",
      marketId: market.id,
      marketName: market.name,
      listingSlug: good.slug,
      amount: sev,
      note: `Bought ${good.name}`,
    }, now);
    nextSheet = r.sheet;
    debt = r.debt;
    lines.push(
      `Took Goblin Debt ${sev} for %cy${good.name}%cn ` +
        `(owed to ${debt.to}).`,
    );
  }

  let nextMarket = market;
  if (listing.stock > 0) {
    nextMarket = {
      ...market,
      listings: market.listings.map((l) =>
        l.slug === listing.slug
          ? { ...l, stock: l.stock - 1 }
          : l
      ),
    };
  }

  if (good.kind === "fruit" && good.fruitSlug) {
    lines.push("  Fruit added to inventory.");
    return {
      ok: true,
      sheet: nextSheet,
      market: nextMarket,
      good,
      debt,
      lines,
      fruitSlug: good.fruitSlug,
    };
  }

  lines.push(`  ${good.description.slice(0, 70)}`);
  return {
    ok: true,
    sheet: nextSheet,
    market: nextMarket,
    good,
    debt,
    lines,
    tokenNote: good.description,
  };
}

/** Persist market + optional fruit object. */
export async function applyBuySideEffects(
  u: IUrsamuSDK,
  r: BuyResult,
): Promise<void> {
  if (!r.ok || !r.market) return;
  await saveMarket(r.market);
  if (r.fruitSlug) {
    await createFruitObject(u, u.me.id, r.fruitSlug);
  }
}
