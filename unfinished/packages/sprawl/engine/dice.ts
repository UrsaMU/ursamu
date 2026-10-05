/** Sprawl Goons dice — 2d6, Glitch, Upgrade, exploding 6s. */

export type DiceMode = "normal" | "glitch" | "upgrade";

export interface IDiceResult {
  mode: DiceMode;
  dice: number[];
  kept: [number, number];
  total: number;
  doubles: boolean;
  doubleSix: boolean;
  doubleOne: boolean;
  explodeBonus: number;
}

function d6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/** Keep two worst (glitch) or two best (upgrade) of three. */
function pickTwo(
  a: number,
  b: number,
  c: number,
  mode: "glitch" | "upgrade",
): [number, number] {
  const s = [a, b, c].sort((x, y) => x - y);
  if (mode === "glitch") return [s[0], s[1]];
  return [s[1], s[2]];
}

/**
 * Net mode after cancel: each upgrade cancels one glitch.
 * Remaining decides the third die.
 */
export function netMode(
  glitch: number,
  upgrade: number,
): DiceMode {
  const g = Math.max(0, glitch);
  const u = Math.max(0, upgrade);
  if (g === u) return "normal";
  if (g > u) return "glitch";
  return "upgrade";
}

export function roll2d6(
  mode: DiceMode = "normal",
  rng: () => number = d6,
): IDiceResult {
  if (mode === "normal") {
    const a = rng();
    const b = rng();
    return finish([a, b], [a, b], mode, rng);
  }
  const a = rng();
  const b = rng();
  const c = rng();
  const kept = pickTwo(a, b, c, mode);
  return finish([a, b, c], kept, mode, rng);
}

function finish(
  dice: number[],
  kept: [number, number],
  mode: DiceMode,
  rng: () => number,
): IDiceResult {
  const doubles = kept[0] === kept[1];
  const doubleSix = doubles && kept[0] === 6;
  const doubleOne = doubles && kept[0] === 1;
  let explodeBonus = 0;
  if (doubleSix) {
    let extra = rng();
    explodeBonus += extra;
    while (extra === 6) {
      extra = rng();
      explodeBonus += extra;
    }
  }
  const total = kept[0] + kept[1] + explodeBonus;
  return {
    mode,
    dice,
    kept,
    total,
    doubles,
    doubleSix,
    doubleOne,
    explodeBonus,
  };
}

/** Parse "2d6" style — only Nd6 supported for cash etc. */
export function rollNd6(
  n: number,
  rng: () => number = d6,
): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += rng();
  return t;
}
