/**
 * Cyberpunk RED -- Night Market and Economy Utilities
 */
import { skillCheck, d6 } from "./dice.ts";
import type { IMarket, IListing, ICPRCharacter } from "../db/schemas.ts";
import { WEAPONS } from "../data/weapons.ts";
import { ARMOR_CATALOG } from "../data/armor.ts";
import { DRUGS } from "../data/drugs.ts";
import { CYBERWARE_CATALOG } from "../data/cyberware.ts";

// -- Market Eligibility --------------------------------------------------------

/** Minimum Fixer Operator rank to open a Night Market. */
export const NIGHT_MARKET_MIN_RANK = 5;

/** Minimum rank for a Midnight Market. */
export const MIDNIGHT_MARKET_MIN_RANK = 9;

/** Night Market duration: 4 hours. */
export const MARKET_DURATION_MS = 4 * 60 * 60 * 1000;

export const canOpenNightMarket = (char: ICPRCharacter): boolean =>
  char.role === "fixer" && char.roleRank >= NIGHT_MARKET_MIN_RANK;

export const canOpenMidnightMarket = (char: ICPRCharacter): boolean =>
  char.role === "fixer" && char.roleRank >= MIDNIGHT_MARKET_MIN_RANK;

// -- Haggle Check --------------------------------------------------------------

export interface IHaggleResult {
  success: boolean;
  roll: number;
  total: number;
  defenseTotal: number;
  discount: number;  // percentage (positive = buyer saves, negative = seller earns more)
  newPrice: number;
}

/**
 * Haggle: COOL + Trading + Operator Rank + 1d10 vs opponent's COOL + Trading + their Rank + 1d10.
 * Result depends on Fixer's Operator rank tier.
 */
export const resolveHaggle = (
  buyer: ICPRCharacter,
  originalPrice: number,
  sellerCool = 5,
  sellerTrading = 4,
  sellerOperatorRank = 0
): IHaggleResult => {
  const tradingSkill = buyer.skills["trading"] ?? 0;
  const buyerResult = skillCheck(buyer.stats.cool, tradingSkill + buyer.roleRank);
  const defResult = skillCheck(sellerCool, sellerTrading + sellerOperatorRank);

  const success = buyerResult.total > defResult.total;
  const discountPct = haggledDiscount(buyer.roleRank);
  const newPrice = success
    ? Math.max(1, Math.round(originalPrice * (1 - discountPct / 100)))
    : originalPrice;

  return {
    success,
    roll: buyerResult.roll,
    total: buyerResult.total,
    defenseTotal: defResult.total,
    discount: success ? discountPct : 0,
    newPrice,
  };
};

/** Discount percentage by Fixer Operator rank tier. */
const haggledDiscount = (rank: number): number => {
  if (rank >= 9) return 20;  // 20% off
  if (rank >= 5) return 15;  // 20% of job pay (simplified to 15% generic)
  return 10;                  // 10% off
};

// -- Reach Validation ---------------------------------------------------------

/**
 * Can the Fixer source this price category based on their rank?
 * Outside a Night Market (individual sourcing per rank).
 */
export const canReachPriceCategory = (
  fixerRank: number,
  category: string
): boolean => {
  const tierMap: Record<string, number> = {
    cheap: 1, everyday: 1,
    costly: 3, premium: 3,
    expensive: 3, very_expensive: 7,
    luxury: 9, super_luxury: 10,
  };
  const required = tierMap[category.toLowerCase()] ?? 10;
  return fixerRank >= required;
};

// -- Listing Helpers -----------------------------------------------------------

export const createListing = (
  marketId: string,
  sellerId: string,
  sellerName: string,
  itemName: string,
  description: string,
  price: number,
  priceCategory: string,
  quantity = 1
): IListing => ({
  id: crypto.randomUUID(),
  marketId,
  sellerId,
  sellerName,
  itemName,
  description,
  price,
  priceCategory: priceCategory as IListing["priceCategory"],
  quantity,
  createdAt: Date.now(),
});

// -- EB Transfer ---------------------------------------------------------------

/**
 * Validate that a character can afford a purchase.
 */
export const canAfford = (char: ICPRCharacter, amount: number): boolean =>
  char.eurodollars >= amount;

/**
 * Deduct EB from a character. Returns new total or throws if insufficient.
 */
export const deductEB = (current: number, amount: number): number => {
  if (current < amount) throw new Error("Insufficient Eurodollars.");
  return current - amount;
};

export const addEB = (current: number, amount: number): number =>
  current + amount;

// -- Auto-Stock ----------------------------------------------------------------

type StockTier = "night" | "midnight";

interface IStockCandidate { name: string; price: number; category: string; }

const NIGHT_TIERS    = new Set(["cheap", "everyday", "costly"]);
const MIDNIGHT_TIERS = new Set(["premium", "expensive", "very_expensive"]);

function buildCandidates(tier: StockTier): IStockCandidate[] {
  const allowed = tier === "midnight" ? MIDNIGHT_TIERS : NIGHT_TIERS;
  const items: IStockCandidate[] = [];
  for (const w of WEAPONS) {
    if (allowed.has(w.priceCategory))
      items.push({ name: w.name.replace(/_/g, " "), price: w.costEb, category: w.priceCategory });
  }
  for (const a of ARMOR_CATALOG) {
    if (allowed.has(a.priceCategory))
      items.push({ name: a.name.replace(/_/g, " "), price: a.costEb, category: a.priceCategory });
  }
  for (const d of DRUGS) {
    if (allowed.has(d.priceCategory))
      items.push({ name: d.displayName, price: d.costEb, category: d.priceCategory });
  }
  const cwPriceMap: Record<string, number> = {
    cheap: 10, everyday: 50, costly: 100, premium: 500,
    expensive: 1000, very_expensive: 5000, luxury: 10000, super_luxury: 100000,
  };
  for (const c of CYBERWARE_CATALOG) {
    if (allowed.has(c.priceCategory))
      items.push({ name: c.name.replace(/_/g, " "), price: cwPriceMap[c.priceCategory] ?? 100, category: c.priceCategory });
  }
  return items;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const rollStartingStock = (
  marketId: string,
  sellerId: string,
  sellerName: string,
  tier: StockTier,
): IListing[] => {
  const pool = buildCandidates(tier);
  if (pool.length === 0) return [];
  const count = 2 + (d6() % 4);   // 2–5 items
  const listings: IListing[] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (listings.length < count && attempts < pool.length * 2) {
    attempts++;
    const item = pickRandom(pool);
    if (used.has(item.name)) continue;
    used.add(item.name);
    listings.push(createListing(marketId, sellerId, sellerName, item.name, "", item.price, item.category));
  }
  return listings;
};

// -- Lifestyle Due Date --------------------------------------------------------

import { ONE_MONTH_MS } from "../data/lifestyles.ts";

export const nextLifestyleDueDate = (): number =>
  Date.now() + ONE_MONTH_MS;

export const isLifestyleOverdue = (nextDueDate: number): boolean =>
  Date.now() >= nextDueDate;

export const daysOverdue = (nextDueDate: number): number => {
  const overduems = Date.now() - nextDueDate;
  if (overduems <= 0) return 0;
  return Math.floor(overduems / (24 * 60 * 60 * 1000));
};
