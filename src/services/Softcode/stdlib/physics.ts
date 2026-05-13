// deno-lint-ignore-file require-await
import { register } from "./registry.ts";
import { fmt } from "./helpers.ts";

const EPS = 1e-10;
const ARGBAD = "#-1 ARGUMENT OUT OF RANGE";

/**
 * Parse a "x y z" 3-vector. Returns null if any component is non-numeric or
 * the string is missing/empty (L1 audit fix — previously silently coerced
 * garbage to zero).
 */
function parseVec3(s: string | undefined): [number, number, number] | null {
  if (s === undefined || s.trim() === "") return null;
  const parts = s.split(" ").map(p => parseFloat(p));
  if (parts.length < 3 || parts.some(p => !Number.isFinite(p))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** Parse a numeric arg, returning null on non-numeric or missing input. */
function parseN(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

// ── vreflect ──────────────────────────────────────────────────────────────
// Reflect v across plane with normal n: r = v - 2*(v·n)*n.
// Assumes n is already a unit vector; callers should pass a normalized normal.
register("vreflect", async (a) => {
  const v = parseVec3(a[0]);
  const n = parseVec3(a[1]);
  if (v === null || n === null) return ARGBAD;
  const [vx, vy, vz] = v;
  const [nx, ny, nz] = n;
  const dot = vx * nx + vy * ny + vz * nz;
  return [
    fmt(vx - 2 * dot * nx),
    fmt(vy - 2 * dot * ny),
    fmt(vz - 2 * dot * nz),
  ].join(" ");
});

// ── pointinaabb ───────────────────────────────────────────────────────────
// Inclusive bounds check. Empty box (min > max on any axis) → outside.
register("pointinaabb", async (a) => {
  const args = [0,1,2,3,4,5,6,7,8].map(i => parseN(a[i]));
  if (args.some(v => v === null)) return ARGBAD;
  const [px, py, pz, minx, miny, minz, maxx, maxy, maxz] = args as number[];
  if (minx > maxx || miny > maxy || minz > maxz) return "0";
  const inside =
    px >= minx && px <= maxx &&
    py >= miny && py <= maxy &&
    pz >= minz && pz <= maxz;
  return inside ? "1" : "0";
});

// ── rayaabb ───────────────────────────────────────────────────────────────
// Slab-method ray/AABB intersection. Returns entry t (≥0) on hit, or -1.
// Ray starting inside the box returns 0.
register("rayaabb", async (a) => {
  const args = [0,1,2,3,4,5,6,7,8,9,10,11].map(i => parseN(a[i]));
  if (args.some(v => v === null)) return ARGBAD;
  const [ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz] = args as number[];
  const minv = [minx, miny, minz];
  const maxv = [maxx, maxy, maxz];
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];

  let tmin = -Infinity;
  let tmax = Infinity;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < EPS) {
      if (o[i] < minv[i] || o[i] > maxv[i]) return "-1";
      continue;
    }
    let t1 = (minv[i] - o[i]) / d[i];
    let t2 = (maxv[i] - o[i]) / d[i];
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return "-1";
  }

  if (tmax < 0) return "-1";
  return fmt(Math.max(tmin, 0));
});
