/**
 * NPC combat attacks live on the sheet (not as inventory items).
 * AI uses these; corpses only drop `drops` loot, never bites/beaks.
 */
import type { DndSheet } from "../stats/dnd_sheet.ts";
import type { NpcTemplate } from "../data/catalog.ts";

export type NpcAttack = {
  /** Stable id for AI abilityId, e.g. "bite", "scimitar" */
  id: string;
  name: string;
  damage: string;
  damageType: string;
  finesse?: boolean;
  ranged?: boolean;
  /** Natural attack — never lootable inventory. */
  natural: boolean;
};

function slugId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "strike";
}

/** Build sheet attacks from NPC template weapon (and future multi-attack). */
export function attacksFromTemplate(
  t: NpcTemplate | undefined,
): NpcAttack[] {
  if (!t?.weapon) {
    return [{
      id: "unarmed",
      name: "Strike",
      damage: "1d4",
      damageType: "bludgeoning",
      natural: true,
    }];
  }
  const w = t.weapon;
  const natural = isNaturalWeaponName(w.name);
  return [{
    id: slugId(w.name),
    name: w.name,
    damage: w.damage,
    damageType: w.damageType,
    finesse: !!w.finesse,
    ranged: !!w.ranged,
    natural,
  }];
}

/** Claws, bite, beak, slam, etc. — not dropped loot. */
export function isNaturalWeaponName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("bite") ||
    n.includes("claw") ||
    n.includes("beak") ||
    n.includes("slam") ||
    n.includes("tentacle") ||
    n.includes("horn") ||
    n.includes("tail") ||
    n.includes("stinger") ||
    n.includes("fist") ||
    n === "strike" ||
    n === "unarmed"
  );
}

export function attacksOf(sheet: DndSheet): NpcAttack[] {
  // deno-lint-ignore no-explicit-any
  const raw = (sheet as any).attacks;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((a: NpcAttack, i: number) => ({
      id: a.id || slugId(a.name || `atk-${i}`),
      name: a.name || "Strike",
      damage: a.damage || "1d6",
      damageType: a.damageType || "bludgeoning",
      finesse: !!a.finesse,
      ranged: !!a.ranged,
      natural: a.natural !== false &&
        isNaturalWeaponName(a.name || ""),
    }));
  }
  return [{
    id: "strike",
    name: "Strike",
    damage: "1d6",
    damageType: "bludgeoning",
    natural: true,
  }];
}

export function pickAttack(
  sheet: DndSheet,
  abilityId?: string,
): NpcAttack {
  const list = attacksOf(sheet);
  if (abilityId) {
    const hit = list.find((a) =>
      a.id === abilityId ||
      a.name.toLowerCase() === abilityId.toLowerCase()
    );
    if (hit) return hit;
  }
  return list[0];
}

/** Parse "2d6+3" / "1d8" / "1" into a roll total. */
export function rollDamageFormula(formula: string): {
  total: number;
  detail: string;
} {
  const f = formula.trim().toLowerCase().replace(/\s+/g, "");
  const m = f.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const sides = parseInt(m[2], 10);
    const mod = m[3] ? parseInt(m[3], 10) : 0;
    let sum = 0;
    const parts: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(Math.random() * sides) + 1;
      parts.push(r);
      sum += r;
    }
    const total = Math.max(1, sum + mod);
    const detail = mod
      ? `${n}d${sides}(${parts.join("+")})${mod >= 0 ? "+" : ""}${mod}`
      : `${n}d${sides}(${parts.join("+")})`;
    return { total, detail };
  }
  const flat = parseInt(f, 10);
  if (Number.isFinite(flat) && flat > 0) {
    return { total: flat, detail: String(flat) };
  }
  return { total: 1, detail: "1" };
}
