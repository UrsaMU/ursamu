// Goblin Market + Debt types (CtL 2e, simplified).

export type MarketGoodKind =
  | "fruit"
  | "token"
  | "oddment"
  | "service";

/** Catalog entry (resources/goblin_market.json). */
export interface MarketGood {
  slug: string;
  name: string;
  kind: MarketGoodKind;
  /** When kind=fruit, spawn this goblin-fruit slug. */
  fruitSlug?: string;
  description: string;
  priceGlamour: number;
  /** Debt severity if bought on credit (0 = cash only). */
  priceDebt: number;
  defaultStock: number;
  book: string;
}

/** Stock line on a market instance. */
export interface MarketListing {
  slug: string;
  /** Remaining units; -1 = unlimited. */
  stock: number;
  /** Override catalog prices when set. */
  priceGlamour?: number;
  priceDebt?: number;
  seller?: string;
}

/** Persistent market (room-linked). */
export interface GoblinMarket {
  id: string;
  name: string;
  /** Mortal-facing name (dual look). */
  maskName?: string;
  roomId: string;
  open: boolean;
  listings: MarketListing[];
  createdBy: string;
  createdAt: number;
  flavor?: string;
}

export type DebtStatus = "open" | "called" | "paid";

/** One Goblin Debt on a changeling sheet. */
export interface GoblinDebt {
  id: string;
  /** Who is owed (vendor label). */
  to: string;
  marketId?: string;
  marketName?: string;
  listingSlug?: string;
  /** Severity 1–5. */
  amount: number;
  note: string;
  status: DebtStatus;
  owedAt: number;
  calledAt?: number;
  calledNote?: string;
  paidAt?: number;
}

export type PayMode = "glamour" | "debt";
