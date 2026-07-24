// Goblin fruit catalog (CtL 2e pp.207–208).

import data from "../../resources/goblin_fruit.json" with { type: "json" };

export type FruitRarity = "common" | "exceptional" | "oddment";

export type FruitEffect =
  | { kind: "glamour"; amount: number }
  | { kind: "willpower"; amount: number }
  | {
    kind: "heal";
    damage: "bashing" | "lethal" | "aggravated";
    amount: number;
  }
  | { kind: "condition"; key: string; note?: string }
  | { kind: "flag"; key: string; hours: number }
  | { kind: "note"; text: string };

export interface GoblinFruit {
  readonly slug: string;
  readonly name: string;
  readonly rarity: FruitRarity;
  readonly edible: boolean;
  readonly description: string;
  readonly effect: string;
  readonly effects: readonly FruitEffect[];
  readonly forageWeight: number;
  readonly book: string;
}

const freezeAll = <T>(items: T[]): readonly T[] =>
  Object.freeze(items.map((i) => Object.freeze({ ...i })));

export const GOBLIN_FRUITS: readonly GoblinFruit[] = freezeAll(
  (data.fruits as GoblinFruit[]).map((f) => ({
    ...f,
    effects: Object.freeze([...(f.effects ?? [])]),
  })),
);

export function findFruit(slug: string): GoblinFruit | null {
  const q = slug.trim().toLowerCase();
  return (
    GOBLIN_FRUITS.find(
      (f) =>
        f.slug === q ||
        f.name.toLowerCase() === q ||
        f.slug.replace(/-/g, " ") === q,
    ) ?? null
  );
}

export function listFruits(
  filter?: "common" | "exceptional" | "oddment" | "all",
): GoblinFruit[] {
  if (!filter || filter === "all") return [...GOBLIN_FRUITS];
  return GOBLIN_FRUITS.filter((f) => f.rarity === filter);
}

/** Weighted pick for forage. Bias exceptional on exceptional success. */
export function pickForageFruit(
  exceptionalSuccess: boolean,
  rng: () => number = Math.random,
): GoblinFruit {
  let pool = GOBLIN_FRUITS.filter((f) => f.forageWeight > 0);
  if (exceptionalSuccess) {
    const rare = pool.filter((f) => f.rarity !== "common");
    if (rare.length) pool = rare;
  }
  const total = pool.reduce((s, f) => s + f.forageWeight, 0);
  let roll = rng() * total;
  for (const f of pool) {
    roll -= f.forageWeight;
    if (roll <= 0) return f;
  }
  return pool[pool.length - 1] ?? GOBLIN_FRUITS[0];
}

/** Carry capacity outside the Hedge (book table). */
export function fruitCarryCap(wyrd: number): number {
  const w = Math.max(0, Math.floor(wyrd));
  if (w <= 0) return 0;
  if (w === 1) return 3;
  if (w <= 3) return 7;
  if (w <= 6) return 13;
  if (w <= 8) return 29;
  if (w === 9) return 101;
  return Number.POSITIVE_INFINITY;
}
