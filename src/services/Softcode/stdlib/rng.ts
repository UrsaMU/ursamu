// Shared seedable RNG for the softcode stdlib.
//
// When unseeded (_state === null), `random()` defers to Math.random() to
// preserve historical behavior. Once `setSeed(n)` is called (including
// setSeed(0)), all stdlib random consumers (rand, lrand, randseed) draw
// from a mulberry32 PRNG so sequences become deterministic across calls.
//
// Call `setSeed(null)` to clear the seed and return to Math.random().

/** Internal: mulberry32 step — advances state and returns next float in [0,1). */
function mulberry32Step(state: number): { value: number; state: number } {
  const s = (state + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

let _state: number | null = null;
let _seed: number | null = null;

/** Returns the current seed, or null if unseeded. */
export function getSeed(): number | null {
  return _seed;
}

/** Seed the RNG. Pass null to clear and fall back to Math.random(). */
export function setSeed(seed: number | null): void {
  _seed = seed;
  _state = seed === null ? null : (seed >>> 0);
}

/** mulberry32 — returns a float in [0, 1). */
export function random(): number {
  if (_state === null) return Math.random();
  const step = mulberry32Step(_state);
  _state = step.state;
  return step.value;
}

/**
 * Per-instance seedable PRNG (mulberry32). Independent of the module-level
 * singleton used by softcode rand()/lrand().
 *
 * Construct with a numeric seed for deterministic sequences, or with no arg
 * (or null) to delegate to Math.random().
 */
export class Rng {
  private _state: number | null;
  private _seed: number | null;

  constructor(seed: number | null = null) {
    this._seed = seed ?? null;
    this._state = seed == null ? null : (seed >>> 0);
  }

  setSeed(seed: number | null): void {
    this._seed = seed;
    this._state = seed === null ? null : (seed >>> 0);
  }

  getSeed(): number | null {
    return this._seed;
  }

  /** [0, 1) */
  random(): number {
    if (this._state === null) return Math.random();
    const step = mulberry32Step(this._state);
    this._state = step.state;
    return step.value;
  }

  /** Integer in [min, max] inclusive. */
  rand(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /** Pick a random element; undefined when items is empty. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.random() * items.length)];
  }

  /** Fisher–Yates shuffle; returns a new array, never mutates input. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** Convenience factory: `createRng(42)` is equivalent to `new Rng(42)`. */
export function createRng(seed: number | null = null): Rng {
  return new Rng(seed);
}
