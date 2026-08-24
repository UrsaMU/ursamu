/**
 * Roll treasure tables → spawnable drop specs.
 */
import type { TreasureEntry, TreasureTable } from "./types.ts";
import { treasureBySlug } from "./catalog.ts";
import { magicBySlug, magicSpawnSpec } from "./magic.ts";

export type RolledLoot = {
  gp: number;
  items: Array<{
    name: string;
    type: string;
    extra?: Record<string, unknown>;
  }>;
  lines: string[];
};

function rollFormula(formula: string): number {
  const flat = formula.trim().match(/^(\d+)$/);
  if (flat) return parseInt(flat[1], 10);
  // NdM+K or NdM
  const m = formula.trim().match(
    /^(\d+)[dD](\d+)(?:\s*([+-])\s*(\d+))?$/,
  );
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.floor(Math.random() * sides) + 1;
  }
  if (m[4]) {
    const b = parseInt(m[4], 10);
    sum += m[3] === "-" ? -b : b;
  }
  return Math.max(0, sum);
}

export function rollTreasureTable(
  table: TreasureTable,
  rng: () => number = Math.random,
): RolledLoot {
  let gp = 0;
  const items: RolledLoot["items"] = [];
  const lines: string[] = [];

  for (const e of table.entries) {
    if (rng() > e.chance) continue;
    if (e.gp) {
      const n = rollFormula(e.gp);
      if (n > 0) {
        gp += n;
        lines.push(`${n} gp`);
      }
    }
    if (e.item) {
      items.push({
        name: e.item,
        type: e.type || "general",
      });
      lines.push(e.item);
    }
    if (e.magic) {
      const m = magicBySlug(e.magic);
      if (m) {
        const spec = magicSpawnSpec(m);
        items.push({
          name: spec.name,
          type: spec.type,
          extra: spec.extra,
        });
        lines.push(m.name);
      }
    }
  }

  return { gp, items, lines };
}

export function rollTreasureSlug(
  slug: string,
  rng: () => number = Math.random,
): RolledLoot | null {
  const t = treasureBySlug(slug);
  if (!t) return null;
  return rollTreasureTable(t, rng);
}

export type { TreasureEntry };
