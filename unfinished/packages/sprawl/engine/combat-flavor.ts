/**
 * One-line street prose for combat beats.
 * Tables in data/combat-flavor.json; toggle via sheet.combatFlavor.
 */
import flavor from "../data/combat-flavor.json" with {
  type: "json",
};
import type { ISprawlChar } from "../db/schemas.ts";
import type { IActionResult } from "./action.ts";

type PoolMap = Record<string, string[] | undefined>;

const DATA = flavor as {
  hit: PoolMap;
  miss: PoolMap;
  exceptional?: string[];
  nerve?: string[];
  fire?: string[];
  fail_hurt?: string[];
};

export type FlavorInput = {
  result: IActionResult;
  /** Attack mode switch (auto, pb, melee, sg-pb…). */
  mode?: string;
  /** Weapon kind / category. */
  kind?: string;
  category?: string;
  /** true when monofilament specialty fired. */
  mono?: boolean;
  /** true when shotgun specialty. */
  shotgun?: boolean;
  /** Hollywood horde attack. */
  horde?: boolean;
  /** Fire/acid DoT applied this swing. */
  fire?: boolean;
  weaponName?: string;
  targetName?: string;
};

function pick(
  pool: string[] | undefined,
  rng: () => number,
): string | null {
  if (!pool?.length) return null;
  const i = Math.floor(rng() * pool.length) % pool.length;
  return pool[i] ?? null;
}

function fill(
  tpl: string,
  ctx: { weapon?: string; target?: string; margin?: number },
): string {
  let s = tpl;
  if (ctx.weapon) {
    s = s.replaceAll("{weapon}", ctx.weapon);
  }
  if (ctx.target) {
    s = s.replaceAll("{target}", ctx.target);
  }
  if (ctx.margin != null) {
    s = s.replaceAll("{margin}", String(ctx.margin));
  }
  return s;
}

/** Keys to try for hit/miss pools (most specific first). */
function modeKeys(input: FlavorInput): string[] {
  const m = (input.mode ?? "").toLowerCase();
  const keys: string[] = [];
  if (input.horde) keys.push("horde");
  if (input.mono) keys.push("mono");
  if (input.shotgun || m.startsWith("sg")) keys.push("shotgun");
  if (m === "auto" || m === "fa" || m === "fullauto") {
    keys.push("auto");
  }
  if (m === "burst" || m === "b") keys.push("burst");
  if (m === "pb" || m === "pointblank" || m.includes("pb")) {
    keys.push("pb");
  }
  if (m === "melee" || m === "knife" || m === "charge") {
    keys.push("melee");
  }
  const cat = (input.category ?? "").toLowerCase();
  const kind = (input.kind ?? "").toLowerCase();
  if (kind === "heavy" || cat.includes("heavy")) keys.push("heavy");
  if (kind === "melee") keys.push("melee");
  keys.push("default");
  return keys;
}

/**
 * Pick a single flavor line, or null if none / disabled.
 * Priority: nerve → exceptional → fire → fail_hurt → hit/miss pool.
 */
export function combatFlavorLine(
  input: FlavorInput,
  rng: () => number = Math.random,
): string | null {
  const r = input.result;
  const ctx = {
    weapon: input.weaponName,
    target: input.targetName,
    margin: r.margin,
  };

  if (r.needNerveCheck) {
    const line = pick(DATA.nerve, rng);
    if (line) return fill(line, ctx);
  }
  if (r.dice.doubleSix && r.success) {
    const line = pick(DATA.exceptional, rng);
    if (line) return fill(line, ctx);
  }
  if (input.fire && r.success) {
    const line = pick(DATA.fire, rng);
    if (line) return fill(line, ctx);
  }
  if (!r.success && r.damageToSelf > 0) {
    const line = pick(DATA.fail_hurt, rng);
    if (line) return fill(line, ctx);
  }

  const poolRoot = r.success ? DATA.hit : DATA.miss;
  for (const k of modeKeys(input)) {
    const line = pick(poolRoot[k], rng);
    if (line) return fill(line, ctx);
  }
  return null;
}

/** Default on; only off when explicitly false. */
export function flavorEnabled(c: ISprawlChar | null | undefined): boolean {
  if (!c) return true;
  return c.combatFlavor !== false;
}

export function setFlavorEnabled(
  c: ISprawlChar,
  on: boolean,
): ISprawlChar {
  return { ...c, combatFlavor: on };
}
