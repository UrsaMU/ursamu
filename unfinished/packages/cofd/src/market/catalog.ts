// Goblin Market goods catalog.

import raw from "../../resources/goblin_market.json" with {
  type: "json",
};
import type { MarketGood, MarketGoodKind } from "./types.ts";

const KINDS = new Set<MarketGoodKind>([
  "fruit",
  "token",
  "oddment",
  "service",
]);

function parseGood(o: Record<string, unknown>): MarketGood | null {
  const slug = String(o.slug ?? "").toLowerCase().trim();
  if (!slug) return null;
  const kind = String(o.kind ?? "oddment")
    .toLowerCase()
    .trim() as MarketGoodKind;
  if (!KINDS.has(kind)) return null;
  return {
    slug,
    name: String(o.name ?? slug),
    kind,
    fruitSlug: o.fruitSlug
      ? String(o.fruitSlug).toLowerCase().trim()
      : undefined,
    description: String(o.description ?? ""),
    priceGlamour: Math.max(0, Number(o.priceGlamour) || 0),
    priceDebt: Math.max(0, Number(o.priceDebt) || 0),
    defaultStock: Math.max(-1, Math.floor(Number(o.defaultStock) || 0)),
    book: String(o.book ?? ""),
  };
}

const goodsRaw = (raw as { goods?: unknown[] }).goods ?? [];
export const MARKET_GOODS: readonly MarketGood[] = goodsRaw
  .map((g) => parseGood(g as Record<string, unknown>))
  .filter((g): g is MarketGood => g != null);

export function findMarketGood(
  slug: string,
): MarketGood | undefined {
  const q = slug.toLowerCase().trim();
  return MARKET_GOODS.find(
    (g) =>
      g.slug === q ||
      g.slug.replace(/-/g, " ") === q ||
      g.name.toLowerCase() === q,
  );
}

export function listMarketGoods(): readonly MarketGood[] {
  return MARKET_GOODS;
}
