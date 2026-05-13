// Shared seedable RNG for the softcode stdlib.
//
// When unseeded (_state === null), `random()` defers to Math.random() to
// preserve historical behavior. Once `setSeed(n)` is called (including
// setSeed(0)), all stdlib random consumers (rand, lrand, randseed) draw
// from a mulberry32 PRNG so sequences become deterministic across calls.
//
// Call `setSeed(null)` to clear the seed and return to Math.random().

let _state: number | null = null;
let _seed:  number | null = null;

/** Returns the current seed, or null if unseeded. */
export function getSeed(): number | null { return _seed; }

/** Seed the RNG. Pass null to clear and fall back to Math.random(). */
export function setSeed(seed: number | null): void {
  _seed  = seed;
  _state = seed === null ? null : (seed >>> 0);
}

/** mulberry32 — returns a float in [0, 1). */
export function random(): number {
  if (_state === null) return Math.random();
  let t = (_state = (_state + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
