/**
 * Random company data tables (Nodejacker d66).
 */
import type { ISprawlChar } from "../db/schemas.ts";
import { COMPANY_DATA } from "./catalog.ts";
import { rollD66Index } from "./net.ts";
import { netOf, withNet } from "./net-state.ts";

export type LootHit = {
  roll: string;
  a: string;
  b: string;
  label: string;
};

export function rollCompanyData(
  rng: () => number = Math.random,
  pick: "a" | "b" | "both" = "both",
): LootHit {
  const i = rollD66Index(COMPANY_DATA, rng);
  const row = COMPANY_DATA[i]!;
  const a = String(row.a ?? "?");
  const b = String(row.b ?? "?");
  const roll = String(row.roll ?? "");
  let label: string;
  if (pick === "a") label = a;
  else if (pick === "b") label = b;
  else label = `${a} / ${b}`;
  return { roll, a, b, label };
}

/** Add loot to net.companyLoot (cap 12). */
export function bankCompanyLoot(
  c: ISprawlChar,
  label: string,
): ISprawlChar {
  const n = netOf(c);
  const loot = [...(n.companyLoot ?? []), label].slice(-12);
  n.companyLoot = loot;
  n.lastSoftNote = `data: ${label}`.slice(0, 60);
  return withNet(c, n);
}

/**
 * On successful hack: chance of company data.
 * Always on find/query/scan exploits or find-run bank spend path.
 */
export function maybeLootOnHack(
  c: ISprawlChar,
  opts: {
    success: boolean;
    exploitSlug?: string;
    rng?: () => number;
  },
): { next: ISprawlChar; notes: string[] } {
  if (!opts.success) return { next: c, notes: [] };
  const rng = opts.rng ?? Math.random;
  const ex = (opts.exploitSlug ?? "").toLowerCase();
  const force = /find|query|scan|copy|cloner|map/.test(ex);
  // 1-in-3 normal success; always on find-family
  if (!force && d6(rng) > 2) return { next: c, notes: [] };
  const hit = rollCompanyData(rng, "both");
  const next = bankCompanyLoot(c, hit.label);
  return {
    next,
    notes: [`DATA d66 ${hit.roll}: ${hit.label}`],
  };
}

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

export function formatLootLines(c: ISprawlChar): string[] {
  const loot = c.net?.companyLoot ?? [];
  if (!loot.length) return ["  (no company data yet)"];
  return loot.map((L, i) => `  ${i + 1}. ${L}`);
}
