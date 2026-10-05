/**
 * Unified street stock: market.json + Nodejacker catalogs.
 * Catalog prices win on slug clash (consoles / software / hw).
 */
import {
  CONSOLES,
  MARKET,
  NODEJACKER_HW,
  SOFTWARE,
  find,
  findByName,
  type Row,
} from "./catalog.ts";

function asStock(
  rows: Row[],
  category: string,
  kind: string,
): Row[] {
  return rows.map((r) => ({
    ...r,
    category,
    kind,
    cost: Number(r.cost ?? 0),
    name: String(r.name ?? r.slug),
  }));
}

let cached: Row[] | null = null;

/** Full buyable stock (deduped by slug). */
export function marketStock(): Row[] {
  if (cached) return cached;
  const map = new Map<string, Row>();
  for (const r of MARKET) {
    map.set(r.slug, {
      ...r,
      category: String(r.category ?? "general"),
    });
  }
  for (
    const r of asStock(CONSOLES, "console", "console")
  ) {
    map.set(r.slug, r);
  }
  for (
    const r of asStock(SOFTWARE, "software", "software")
  ) {
    map.set(r.slug, r);
  }
  for (
    const r of asStock(NODEJACKER_HW, "net-hw", "net-hw")
  ) {
    map.set(r.slug, r);
  }
  cached = [...map.values()];
  return cached;
}

export function stockInCat(cat: string): Row[] {
  const c = cat.toLowerCase();
  return marketStock().filter((r) =>
    String(r.category ?? "").toLowerCase() === c
  );
}

export function filterStock(
  rows: Row[],
  q: string,
): Row[] {
  const n = q.toLowerCase().trim();
  if (!n) return rows;
  return rows.filter((r) => {
    const blob =
      `${r.slug} ${r.name} ${r.category} ${r.notes ?? ""}`
        .toLowerCase();
    return blob.includes(n);
  });
}

/** Resolve slug/name against full stock + catalogs. */
export function resolveStock(q: string): Row | undefined {
  const raw = q.trim().toLowerCase();
  if (!raw) return undefined;
  const stock = marketStock();
  const exact = stock.find((r) => r.slug === raw);
  if (exact) return exact;
  return find("console", raw) ??
    find("software", raw) ??
    find("nodejackerHw", raw) ??
    find("market", raw) ??
    findByName(stock, q) ??
    findByName(CONSOLES, q) ??
    findByName(SOFTWARE, q) ??
    findByName(NODEJACKER_HW, q);
}

export function stockKind(row: Row): string {
  if (find("console", row.slug)) return "console";
  if (find("software", row.slug)) return "software";
  if (find("nodejackerHw", row.slug)) return "net-hw";
  const k = String(row.kind ?? "").toLowerCase();
  if (k === "console" || k === "software" || k === "net-hw") {
    return k;
  }
  const cat = String(row.category ?? "").toLowerCase();
  if (cat === "console" || cat === "software" || cat === "net-hw") {
    return cat;
  }
  return "";
}
