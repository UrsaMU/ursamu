// deno-lint-ignore-file require-await
// Coherent noise stdlib — Perlin (Ken Perlin, "Improved Noise", 2002, patent
// expired 2022) and simplex (Stefan Gustavson, public-domain reference impl,
// see https://weber.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf).
// Worley/cellular noise: Steven Worley, 1996.
import { register } from "./registry.ts";
import { num, int, fmt } from "./helpers.ts";

const MAX_LEN = 10_000;
const MAX_OCTAVES = 16;

// ── module state ──────────────────────────────────────────────────────────
let _noiseSeed = 0;
let _seedInitialized = false;
const PERM = new Uint8Array(512);

/**
 * Build a fresh 512-byte permutation table deterministically from `seed`.
 * Used by both the singleton `seedNoise()` and the per-instance `Noise` class.
 */
export function buildPerm(seed: number): Uint8Array {
  // FNV-1a hash → seeded shuffle of 0..255
  let h = 2166136261 >>> 0;
  const bytes = new Uint8Array(new Float64Array([seed]).buffer);
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 16777619) >>> 0;
  }
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher–Yates with xorshift32 driven by h
  let s = h || 1;
  for (let i = 255; i > 0; i--) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
}

export function seedNoise(seed: number): void {
  PERM.set(buildPerm(seed));
  _noiseSeed = seed;
  _seedInitialized = true;
}

function ensureSeed(): void {
  if (!_seedInitialized) seedNoise(0);
}

function withSeed<T>(args: string[], idx: number, fn: () => T): T {
  if (args[idx] !== undefined && args[idx] !== "") {
    const prev = _noiseSeed;
    const prevInit = _seedInitialized;
    seedNoise(num(args[idx]));
    try { return fn(); } finally {
      if (prevInit) seedNoise(prev); else { _seedInitialized = false; }
    }
  }
  ensureSeed();
  return fn();
}

// ── helpers ───────────────────────────────────────────────────────────────
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}
function grad1(hash: number, x: number): number {
  return (hash & 1) === 0 ? x : -x;
}
function grad2(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
}
function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

// ── perlin (PERM-parameterized internals) ────────────────────────────────
function _perlin1(perm: Uint8Array, x: number): number {
  const xi = Math.floor(x) & 255;
  const xf = x - Math.floor(x);
  const u  = fade(xf);
  return lerp(u, grad1(perm[xi], xf), grad1(perm[xi + 1], xf - 1));
}

function _perlin2(perm: Uint8Array, x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u  = fade(xf);
  const v  = fade(yf);
  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];
  const x1 = lerp(u, grad2(aa, xf, yf),     grad2(ba, xf - 1, yf));
  const x2 = lerp(u, grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1));
  return lerp(v, x1, x2) / 3;
}

function _perlin3(perm: Uint8Array, x: number, y: number, z: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const zi = Math.floor(z) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const A  = perm[xi]   + yi;
  const AA = perm[A]    + zi;
  const AB = perm[A + 1] + zi;
  const B  = perm[xi + 1] + yi;
  const BA = perm[B]    + zi;
  const BB = perm[B + 1] + zi;
  return lerp(w,
    lerp(v,
      lerp(u, grad3(perm[AA],     xf,     yf,     zf),
              grad3(perm[BA],     xf - 1, yf,     zf)),
      lerp(u, grad3(perm[AB],     xf,     yf - 1, zf),
              grad3(perm[BB],     xf - 1, yf - 1, zf))),
    lerp(v,
      lerp(u, grad3(perm[AA + 1], xf,     yf,     zf - 1),
              grad3(perm[BA + 1], xf - 1, yf,     zf - 1)),
      lerp(u, grad3(perm[AB + 1], xf,     yf - 1, zf - 1),
              grad3(perm[BB + 1], xf - 1, yf - 1, zf - 1))));
}

// Singleton-backed public wrappers (back-compat surface)
export function perlin1(x: number): number              { ensureSeed(); return _perlin1(PERM, x); }
export function perlin2(x: number, y: number): number   { ensureSeed(); return _perlin2(PERM, x, y); }
export function perlin3(x: number, y: number, z: number): number {
  ensureSeed();
  return _perlin3(PERM, x, y, z);
}

// ── simplex 2D (Gustavson reference impl, public domain) ──────────────────
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

function _simplex2(perm: Uint8Array, xin: number, yin: number): number {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = perm[ii + perm[jj]] & 7;
  const gi1 = perm[ii + i1 + perm[jj + j1]] & 7;
  const gi2 = perm[ii + 1 + perm[jj + 1]] & 7;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * grad2(gi0, x0, y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * grad2(gi1, x1, y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * grad2(gi2, x2, y2); }
  return 40 * (n0 + n1 + n2);
}

export function simplex2(xin: number, yin: number): number {
  ensureSeed();
  return _simplex2(PERM, xin, yin);
}

// ── worley 2D (cellular F1 distance) ──────────────────────────────────────
function _worley2(perm: Uint8Array, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let min = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const h1 = perm[(cx & 255) + perm[cy & 255]];
      const h2 = perm[(cx & 255) + perm[(cy + 1) & 255]];
      const px = cx + (h1 / 255);
      const py = cy + (h2 / 255);
      const ex = px - x;
      const ey = py - y;
      const d  = ex * ex + ey * ey;
      if (d < min) min = d;
    }
  }
  return Math.sqrt(min);
}

export function worley2(x: number, y: number): number {
  ensureSeed();
  return _worley2(PERM, x, y);
}

// ── fbm / ridged ──────────────────────────────────────────────────────────
function _fbm2(perm: Uint8Array, x: number, y: number, octaves: number, persistence: number): number {
  let total = 0, freq = 1, amp = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    total += _perlin2(perm, x * freq, y * freq) * amp;
    maxAmp += amp;
    amp *= persistence;
    freq *= 2;
  }
  return maxAmp === 0 ? 0 : total / maxAmp;
}

function _ridged2(perm: Uint8Array, x: number, y: number, octaves: number, persistence: number): number {
  let total = 0, freq = 1, amp = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(_perlin2(perm, x * freq, y * freq));
    total += (n * 2 - 1) * amp;
    maxAmp += amp;
    amp *= persistence;
    freq *= 2;
  }
  return maxAmp === 0 ? 0 : total / maxAmp;
}

export function fbm2(x: number, y: number, octaves: number, persistence: number): number {
  ensureSeed();
  return _fbm2(PERM, x, y, octaves, persistence);
}

export function ridged2(x: number, y: number, octaves: number, persistence: number): number {
  ensureSeed();
  return _ridged2(PERM, x, y, octaves, persistence);
}

// ── public grid generator ─────────────────────────────────────────────────
export function noiseGrid(
  seed: number,
  width: number,
  height: number,
  scale: number,
  fn?: "perlin2" | "simplex2" | "worley2",
): number[] {
  let w = Math.max(0, Math.floor(width) | 0);
  let h = Math.max(0, Math.floor(height) | 0);
  const s = scale || 1;
  // DoS clamp: w*h ≤ MAX_LEN (preserve aspect by truncating rows)
  if (w * h > MAX_LEN) {
    const rows = Math.max(1, Math.floor(MAX_LEN / Math.max(1, w)));
    w = Math.min(w, MAX_LEN);
    h = rows;
  }
  const name = (fn ?? "perlin2").toLowerCase().trim();
  let pick: (x: number, y: number) => number;
  if (name === "simplex2") pick = simplex2;
  else if (name === "worley2") pick = worley2;
  else pick = perlin2; // default + fail-soft on unknown

  const prevInit = _seedInitialized;
  const prevSeed = _noiseSeed;
  seedNoise(seed);
  try {
    const out: number[] = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        out.push(pick(i * s, j * s));
      }
    }
    return out;
  } finally {
    if (prevInit) seedNoise(prevSeed); else _seedInitialized = false;
  }
}

// ── registrations ─────────────────────────────────────────────────────────

register("noiseseed", async (a) => {
  // No-arg or empty: read-only. Returns current seed, or "" if unseeded.
  // M1 audit fix — previously coerced to seedNoise(NaN) → seed 0 silently.
  if (a[0] === undefined || a[0].trim() === "") {
    return _seedInitialized ? fmt(_noiseSeed) : "";
  }
  const prev = _seedInitialized ? _noiseSeed : null;
  seedNoise(num(a[0]));
  return prev === null ? "" : fmt(prev);
});

register("perlin1", async (a) => {
  const x = num(a[0]);
  return withSeed(a, 1, () => fmt(perlin1(x)));
});

register("perlin2", async (a) => {
  const x = num(a[0]); const y = num(a[1]);
  return withSeed(a, 2, () => fmt(perlin2(x, y)));
});

register("perlin3", async (a) => {
  const x = num(a[0]); const y = num(a[1]); const z = num(a[2]);
  return withSeed(a, 3, () => fmt(perlin3(x, y, z)));
});

register("simplex2", async (a) => {
  const x = num(a[0]); const y = num(a[1]);
  return withSeed(a, 2, () => fmt(simplex2(x, y)));
});

register("worley2", async (a) => {
  const x = num(a[0]); const y = num(a[1]);
  return withSeed(a, 2, () => fmt(worley2(x, y)));
});

register("fbm2", async (a) => {
  const x = num(a[0]); const y = num(a[1]);
  const oct = Math.min(Math.max(1, int(a[2]) || 1), MAX_OCTAVES);
  const per = num(a[3]) || 0.5;
  return withSeed(a, 4, () => fmt(fbm2(x, y, oct, per)));
});

register("ridged2", async (a) => {
  const x = num(a[0]); const y = num(a[1]);
  const oct = Math.min(Math.max(1, int(a[2]) || 1), MAX_OCTAVES);
  const per = num(a[3]) || 0.5;
  return withSeed(a, 4, () => fmt(ridged2(x, y, oct, per)));
});

register("noisegrid", async (a) => {
  const seed = num(a[0]);
  const w = Math.max(0, int(a[1]) | 0);
  const h = Math.max(0, int(a[2]) | 0);
  const scale = num(a[3]) || 1;
  const fn = (a[4] ?? "perlin2").toLowerCase().trim() as
    | "perlin2" | "simplex2" | "worley2";
  return noiseGrid(seed, w, h, scale, fn).map(fmt).join(" ");
});

// ── per-instance Noise class (v2.5.2) ────────────────────────────────────
//
// Holds its own PERM table so multiple plugins can each carry an independent
// seeded noise stream without stomping the singleton. Mirrors the Rng class.
//
//   import { createNoise } from "jsr:@ursamu/ursamu";
//   const n = createNoise(42);
//   n.perlin2(0.5, 0.5);  // independent of seedNoise() and any other Noise instance

export class Noise {
  private _perm: Uint8Array;
  private _seed: number;

  constructor(seed: number) {
    this._seed = seed;
    this._perm = buildPerm(seed);
  }

  setSeed(seed: number): void {
    this._seed = seed;
    this._perm = buildPerm(seed);
  }

  getSeed(): number {
    return this._seed;
  }

  perlin1(x: number): number                    { return _perlin1(this._perm, x); }
  perlin2(x: number, y: number): number         { return _perlin2(this._perm, x, y); }
  perlin3(x: number, y: number, z: number): number {
    return _perlin3(this._perm, x, y, z);
  }
  simplex2(x: number, y: number): number        { return _simplex2(this._perm, x, y); }
  worley2(x: number, y: number): number         { return _worley2(this._perm, x, y); }
  fbm2(x: number, y: number, octaves: number, persistence: number): number {
    return _fbm2(this._perm, x, y, octaves, persistence);
  }
  ridged2(x: number, y: number, octaves: number, persistence: number): number {
    return _ridged2(this._perm, x, y, octaves, persistence);
  }

  /**
   * Generate a width*height grid of noise values. Applies the same MAX_LEN
   * (10 000) DoS clamp as the module-level `noiseGrid`. Does not mutate
   * `this._perm` — each cell is sampled against the instance's PERM.
   */
  grid(
    width: number, height: number, scale: number,
    fn?: "perlin2" | "simplex2" | "worley2",
  ): number[] {
    let w = Math.max(0, Math.floor(width) | 0);
    let h = Math.max(0, Math.floor(height) | 0);
    const s = scale || 1;
    if (w * h > MAX_LEN) {
      const rows = Math.max(1, Math.floor(MAX_LEN / Math.max(1, w)));
      w = Math.min(w, MAX_LEN);
      h = rows;
    }
    const name = (fn ?? "perlin2").toLowerCase();
    let pick: (x: number, y: number) => number;
    if (name === "simplex2")      pick = (x, y) => _simplex2(this._perm, x, y);
    else if (name === "worley2")  pick = (x, y) => _worley2(this._perm, x, y);
    else                          pick = (x, y) => _perlin2(this._perm, x, y);
    const out: number[] = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        out.push(pick(i * s, j * s));
      }
    }
    return out;
  }
}

/** Convenience factory: `createNoise(42)` is equivalent to `new Noise(42)`. */
export function createNoise(seed: number): Noise {
  return new Noise(seed);
}
