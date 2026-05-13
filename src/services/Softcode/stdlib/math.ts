// deno-lint-ignore-file require-await
import { register } from "./registry.ts";
import { num, int, fmt } from "./helpers.ts";
import { random as rngRandom, setSeed as rngSetSeed, getSeed as rngGetSeed } from "./rng.ts";

// ── arithmetic ────────────────────────────────────────────────────────────

register("add",  async (a) => fmt(a.reduce((s, x) => s + num(x), 0)));
register("sub",  async (a) => fmt(num(a[0]) - num(a[1])));
register("mul",  async (a) => fmt(a.reduce((s, x) => s * num(x), 1)));
register("div",  async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) / d);
});
register("fdiv", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) / d);
});
register("floordiv", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(Math.floor(num(a[0]) / d));
});
register("mod",  async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) % d);
});
register("remainder", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) % d);
});
register("fmod", async (a) => {
  const d = num(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(num(a[0]) % d);
});
register("abs",  async (a) => fmt(Math.abs(num(a[0]))));
register("iabs", async (a) => fmt(Math.abs(int(a[0]))));
register("iadd", async (a) => fmt(a.reduce((s, x) => s + int(x), 0)));
register("isub", async (a) => fmt(int(a[0]) - int(a[1])));
register("imul", async (a) => fmt(a.reduce((s, x) => s * int(x), 1)));
register("idiv", async (a) => {
  const d = int(a[1]);
  if (d === 0) return "#-1 DIVISION BY ZERO";
  return fmt(Math.trunc(int(a[0]) / d));
});
register("max",  async (a) => fmt(Math.max(...a.map(num))));
register("min",  async (a) => fmt(Math.min(...a.map(num))));
register("round",async (a) => {
  const precision = a[1] !== undefined ? int(a[1]) : 0;
  const factor = Math.pow(10, precision);
  return fmt(Math.round(num(a[0]) * factor) / factor);
});
register("ceil",  async (a) => fmt(Math.ceil(num(a[0]))));
register("floor", async (a) => fmt(Math.floor(num(a[0]))));
register("trunc", async (a) => fmt(Math.trunc(num(a[0]))));
register("sqrt",  async (a) => { const v = num(a[0]); return v < 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.sqrt(v)); });
register("power", async (a) => fmt(Math.pow(num(a[0]), num(a[1]))));
register("exp",   async (a) => fmt(Math.exp(num(a[0]))));
register("ln",    async (a) => { const v = num(a[0]); return v <= 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.log(v)); });
register("log",   async (a) => { const v = num(a[0]); return v <= 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.log10(v)); });
register("e",     async () => fmt(Math.E));
register("pi",    async () => fmt(Math.PI));
register("inc",   async (a) => fmt(num(a[0]) + 1));
register("dec",   async (a) => fmt(num(a[0]) - 1));
register("sign",  async (a) => fmt(Math.sign(num(a[0]))));
register("isign", async (a) => fmt(Math.sign(int(a[0]))));

// ── trig ──────────────────────────────────────────────────────────────────

register("sin",  async (a) => fmt(Math.sin(num(a[0]))));
register("cos",  async (a) => fmt(Math.cos(num(a[0]))));
register("tan",  async (a) => fmt(Math.tan(num(a[0]))));
register("asin", async (a) => fmt(Math.asin(num(a[0]))));
register("acos", async (a) => fmt(Math.acos(num(a[0]))));
register("atan", async (a) => fmt(Math.atan(num(a[0]))));
register("atan2",async (a) => fmt(Math.atan2(num(a[0]), num(a[1]))));

// ── random ────────────────────────────────────────────────────────────────

// rand() draws from the shared stdlib RNG (see ./rng.ts). When randseed()
// has been called, results are deterministic; otherwise it falls through to
// Math.random() for backwards compatibility.
register("rand",  async (a) => {
  const n = int(a[0]);
  if (n <= 0) return "#-1 ARGUMENT MUST BE POSITIVE INTEGER";
  return fmt(Math.floor(rngRandom() * n));
});

// ── comparison ────────────────────────────────────────────────────────────

register("eq",  async (a) => num(a[0]) === num(a[1]) ? "1" : "0");
register("neq", async (a) => num(a[0]) !== num(a[1]) ? "1" : "0");
register("lt",  async (a) => num(a[0]) <   num(a[1]) ? "1" : "0");
register("lte", async (a) => num(a[0]) <=  num(a[1]) ? "1" : "0");
register("gt",  async (a) => num(a[0]) >   num(a[1]) ? "1" : "0");
register("gte", async (a) => num(a[0]) >=  num(a[1]) ? "1" : "0");
// comp() string variant is registered in string.ts (loads after, wins).
// ncomp() is registered below under the WoD dice section.

// ── type checks ───────────────────────────────────────────────────────────

register("isnum",  async (a) => isNaN(parseFloat(a[0])) || a[0].trim() === "" ? "0" : "1");
register("isint",  async (a) => /^-?\d+$/.test(a[0].trim()) ? "1" : "0");
register("israt",  async (a) => /^-?\d+(\.\d+)?$/.test(a[0].trim()) ? "1" : "0");
register("isinf",  async (a) => !isFinite(num(a[0])) && !isNaN(num(a[0])) ? "1" : "0");
register("isword", async (a) => /^\S+$/.test(a[0]) ? "1" : "0");

// ── bitwise ───────────────────────────────────────────────────────────────

register("band",  async (a) => fmt(int(a[0]) & int(a[1])));
register("bor",   async (a) => fmt(int(a[0]) | int(a[1])));
register("bxor",  async (a) => fmt(int(a[0]) ^ int(a[1])));
register("bnand", async (a) => fmt(~(int(a[0]) & int(a[1]))));
register("shl",   async (a) => fmt(int(a[0]) << int(a[1])));
register("shr",   async (a) => fmt(int(a[0]) >> int(a[1])));

// ── base conversion ───────────────────────────────────────────────────────

register("baseconv", async (a) => {
  const from = int(a[1]);
  const to   = int(a[2]);
  if (from < 2 || from > 36 || to < 2 || to > 36) return "#-1 BASE OUT OF RANGE";
  const n = parseInt(a[0], from);
  if (isNaN(n)) return "#-1 INVALID NUMBER";
  return n.toString(to).toUpperCase();
});

// ── distance ─────────────────────────────────────────────────────────────

export function dist2d(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx*dx + dy*dy);
}
export function dist3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x1 - x2, dy = y1 - y2, dz = z1 - z2;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}
export function distSq2d(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2, dy = y1 - y2;
  return dx*dx + dy*dy;
}
export function distSq3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x1 - x2, dy = y1 - y2, dz = z1 - z2;
  return dx*dx + dy*dy + dz*dz;
}
export function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}
export function chebyshev(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
export function angle2d(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}
// bearing — MUSH convention: 0 = N (+Y), clockwise, degrees in [0, 360).
export function bearing(x1: number, y1: number, x2: number, y2: number): number {
  const deg = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  return ((90 - deg) % 360 + 360) % 360;
}

register("dist2d", async (a) => fmt(dist2d(num(a[0]), num(a[1]), num(a[2]), num(a[3]))));
register("dist3d", async (a) => fmt(dist3d(num(a[0]), num(a[1]), num(a[2]), num(a[3]), num(a[4]), num(a[5]))));

// ── vector ────────────────────────────────────────────────────────────────

register("vadd",  async (a) => { const [x1,y1,z1] = a[0].split(" ").map(num); const [x2,y2,z2] = a[1].split(" ").map(num); return [fmt(x1+x2),fmt(y1+y2),fmt((z1||0)+(z2||0))].join(" "); });
register("vsub",  async (a) => { const [x1,y1,z1] = a[0].split(" ").map(num); const [x2,y2,z2] = a[1].split(" ").map(num); return [fmt(x1-x2),fmt(y1-y2),fmt((z1||0)-(z2||0))].join(" "); });
register("vmul",  async (a) => { const s = num(a[1]); return a[0].split(" ").map(x => fmt(num(x)*s)).join(" "); });
register("vmag",  async (a) => { const v = a[0].split(" ").map(num); return fmt(Math.sqrt(v.reduce((s,x) => s+x*x, 0))); });
register("vdim",  async (a) => fmt(a[0].trim().split(/\s+/).length));
register("vdot",  async (a) => { const u2 = a[0].split(" ").map(num); const v = a[1].split(" ").map(num); return fmt(u2.reduce((s,x,i) => s + x*(v[i]||0), 0)); });
register("vunit", async (a) => { const v = a[0].split(" ").map(num); const m = Math.sqrt(v.reduce((s,x) => s+x*x, 0)); return m === 0 ? a[0] : v.map(x => fmt(x/m)).join(" "); });
register("vcross",async (a) => {
  const [x1,y1,z1] = a[0].split(" ").map(num);
  const [x2,y2,z2] = a[1].split(" ").map(num);
  return [fmt(y1*z2-z1*y2), fmt(z1*x2-x1*z2), fmt(x1*y2-y1*x2)].join(" ");
});

// ── numeric comparison (-1/0/1) ───────────────────────────────────────────
// NOTE: string comp() is in string.ts and wins due to load order.
// ncomp() is the numeric variant.
register("ncomp", async (a) => {
  const l = num(a[0]), r = num(a[1]);
  return l < r ? "-1" : l > r ? "1" : "0";
});

// ── WoD dice ──────────────────────────────────────────────────────────────

/**
 * successes(num_dice, difficulty) — roll num_dice d10s, return count >= difficulty.
 * Difficulty defaults to 6 (standard WoD). Returns negative on a botch (all 1s,
 * no successes). Each 1 cancels one success; net negative = botch.
 */
register("successes", async (a) => {
  const n    = Math.max(0, int(a[0]));
  const diff = int(a[1] ?? "6") || 6;
  let successes = 0, ones = 0;
  for (let i = 0; i < n; i++) {
    const roll = Math.floor(Math.random() * 10) + 1;
    if (roll >= diff) successes++;
    else if (roll === 1) ones++;
  }
  const net = successes - ones;
  return String(net);
});

/**
 * distribute(number, slots[, delimiter]) — spread number evenly across slots.
 * distribute(10,3) → "4 3 3"
 */
register("distribute", async (a) => {
  const total = Math.max(0, int(a[0]));
  const slots = Math.max(1, int(a[1]));
  const delim = a[2] ?? " ";
  const base  = Math.floor(total / slots);
  const extra = total % slots;
  return Array.from({ length: slots }, (_, i) => base + (i < extra ? 1 : 0)).join(delim);
});

// ── extended math (v2.5.0) ────────────────────────────────────────────────

register("hypot",  async (a) => fmt(Math.hypot(...a.map(x => parseFloat(x) || 0))));
register("cbrt",   async (a) => fmt(Math.cbrt(num(a[0]))));
register("log2",   async (a) => { const v = num(a[0]); return v <= 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.log2(v)); });
register("log10",  async (a) => { const v = num(a[0]); return v <= 0 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.log10(v)); });
register("log1p",  async (a) => { const v = num(a[0]); return v <= -1 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.log1p(v)); });
register("expm1",  async (a) => fmt(Math.expm1(num(a[0]))));
register("sinh",   async (a) => fmt(Math.sinh(num(a[0]))));
register("cosh",   async (a) => fmt(Math.cosh(num(a[0]))));
register("tanh",   async (a) => fmt(Math.tanh(num(a[0]))));
register("asinh",  async (a) => fmt(Math.asinh(num(a[0]))));
register("acosh",  async (a) => { const v = num(a[0]); return v < 1 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.acosh(v)); });
register("atanh",  async (a) => { const v = num(a[0]); return v <= -1 || v >= 1 ? "#-1 ARGUMENT OUT OF RANGE" : fmt(Math.atanh(v)); });

// ── interpolation & clamp ─────────────────────────────────────────────────

export function clamp(x: number, lo: number, hi: number): number {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return Math.min(b, Math.max(a, x));
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Returns 0 when a === b (degenerate) rather than NaN/Infinity. */
export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}
export function remap(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMin === inMax) return outMin;
  return outMin + ((x - inMin) * (outMax - outMin)) / (inMax - inMin);
}
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
export function smootherstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

register("clamp", async (a) => fmt(clamp(num(a[0]), num(a[1]), num(a[2]))));

register("lerp", async (a) => fmt(lerp(num(a[0]), num(a[1]), num(a[2]))));
register("inverselerp", async (a) => {
  const x = num(a[0]), y = num(a[1]);
  if (x === y) return "#-1 DIVISION BY ZERO";
  return fmt(inverseLerp(x, y, num(a[2])));
});
register("remap", async (a) => {
  const iMin = num(a[1]), iMax = num(a[2]);
  if (iMin === iMax) return "#-1 DIVISION BY ZERO";
  return fmt(remap(num(a[0]), iMin, iMax, num(a[3]), num(a[4])));
});
register("smoothstep", async (a) => {
  const e0 = num(a[0]), e1 = num(a[1]);
  if (e0 === e1) return "#-1 DIVISION BY ZERO";
  return fmt(smoothstep(e0, e1, num(a[2])));
});
register("smootherstep", async (a) => {
  const e0 = num(a[0]), e1 = num(a[1]);
  if (e0 === e1) return "#-1 DIVISION BY ZERO";
  return fmt(smootherstep(e0, e1, num(a[2])));
});

// ── spatial scalars ───────────────────────────────────────────────────────

register("distsq2d", async (a) => fmt(distSq2d(num(a[0]), num(a[1]), num(a[2]), num(a[3]))));
register("distsq3d", async (a) => fmt(distSq3d(num(a[0]), num(a[1]), num(a[2]), num(a[3]), num(a[4]), num(a[5]))));
register("manhattan", async (a) => fmt(manhattan(num(a[0]), num(a[1]), num(a[2]), num(a[3]))));
register("chebyshev", async (a) => fmt(chebyshev(num(a[0]), num(a[1]), num(a[2]), num(a[3]))));
register("angle2d", async (a) => fmt(angle2d(num(a[0]), num(a[1]), num(a[2]), num(a[3]))));
register("bearing", async (a) => fmt(bearing(num(a[0]), num(a[1]), num(a[2]), num(a[3]))));

// ── seedable RNG ──────────────────────────────────────────────────────────
//
// randseed() — get/set the shared RNG seed. Once set, rand() and lrand()
// produce deterministic sequences. Call with no args to read the seed,
// or pass an integer to (re)seed. There is no way to unseed via softcode.
register("randseed", async (a) => {
  if (a[0] === undefined || a[0].trim() === "") {
    const s = rngGetSeed();
    return s === null ? "" : String(s);
  }
  // L3 audit fix — explicit "clear" arg reverts to Math.random() fallback.
  if (a[0].trim().toLowerCase() === "clear") {
    rngSetSeed(null);
    return "";
  }
  rngSetSeed(int(a[0]));
  return String(int(a[0]));
});

// ── Unreal-style vector aliases ───────────────────────────────────────────
// All vector aliases require their args to be non-empty space-separated
// numeric vectors. Missing or empty args return the MUSH "#-1 ARGUMENT
// MISSING" string instead of throwing (M2 audit fix).

const ARGMISS = "#-1 ARGUMENT MISSING";

export type Vec = readonly number[];

export function vsize(v: Vec): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}
export function vsizeSq(v: Vec): number {
  let s = 0;
  for (const x of v) s += x * x;
  return s;
}
export function vdistance(a: Vec, b: Vec): number {
  const n = Math.max(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}
export function vdistanceSq(a: Vec, b: Vec): number {
  const n = Math.max(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return s;
}
export function vlerp(a: Vec, b: Vec, t: number): number[] {
  const n = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0, bv = b[i] ?? 0;
    out.push(av + (bv - av) * t);
  }
  return out;
}
export function vclamp(v: Vec, lo: number, hi: number): number[] {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return v.map(x => Math.min(b, Math.max(a, x)));
}

register("vsize", async (a) => {
  if (!a[0]) return ARGMISS;
  return fmt(vsize(a[0].split(" ").map(num)));
});
register("vsizesq", async (a) => {
  if (!a[0]) return ARGMISS;
  return fmt(vsizeSq(a[0].split(" ").map(num)));
});
register("vdistance", async (a) => {
  if (!a[0] || !a[1]) return ARGMISS;
  // Legacy softcode behavior: treat 2D vectors as having z=0 (pad to 3D).
  const va = a[0].split(" ").map(num); while (va.length < 3) va.push(0);
  const vb = a[1].split(" ").map(num); while (vb.length < 3) vb.push(0);
  return fmt(vdistance(va, vb));
});
register("vdistsquared", async (a) => {
  if (!a[0] || !a[1]) return ARGMISS;
  const va = a[0].split(" ").map(num); while (va.length < 3) va.push(0);
  const vb = a[1].split(" ").map(num); while (vb.length < 3) vb.push(0);
  return fmt(vdistanceSq(va, vb));
});
register("vlerp", async (a) => {
  if (!a[0] || !a[1] || a[2] === undefined) return ARGMISS;
  const va = a[0].split(" ").map(num);
  const vb = a[1].split(" ").map(num);
  return vlerp(va, vb, num(a[2])).map(fmt).join(" ");
});
register("vclamp", async (a) => {
  if (!a[0] || a[1] === undefined || a[2] === undefined) return ARGMISS;
  return vclamp(a[0].split(" ").map(num), num(a[1]), num(a[2])).map(fmt).join(" ");
});

register("bittype",    async () => "0");
register("roman",      async (a) => {
  // Basic Roman numeral conversion
  const n = int(a[0]);
  if (n <= 0 || n > 3999) return "#-1 OUT OF RANGE";
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  let result = "", rem = n;
  for (let i = 0; i < vals.length; i++) {
    while (rem >= vals[i]) { result += syms[i]; rem -= vals[i]; }
  }
  return result;
});
