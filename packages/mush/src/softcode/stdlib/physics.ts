// deno-lint-ignore-file require-await
import { register } from "./registry.ts";
import { fmt } from "./helpers.ts";

const EPS = 1e-10;
const ARGBAD = "#-1 ARGUMENT OUT OF RANGE";

export type Vec3 = readonly [number, number, number];

/**
 * Reflect v across the plane with normal n (assumed unit).
 *   r = v - 2*(v·n)*n
 */
export function vreflect(v: Vec3, n: Vec3): [number, number, number] {
  const [vx, vy, vz] = v;
  const [nx, ny, nz] = n;
  const dot = vx * nx + vy * ny + vz * nz;
  return [
    vx - 2 * dot * nx,
    vy - 2 * dot * ny,
    vz - 2 * dot * nz,
  ];
}

/** Inclusive 3D point-in-AABB test. Returns false if min > max on any axis. */
export function pointInAabb(p: Vec3, min: Vec3, max: Vec3): boolean {
  const [px, py, pz] = p;
  const [minx, miny, minz] = min;
  const [maxx, maxy, maxz] = max;
  if (minx > maxx || miny > maxy || minz > maxz) return false;
  return (
    px >= minx && px <= maxx &&
    py >= miny && py <= maxy &&
    pz >= minz && pz <= maxz
  );
}

/**
 * Slab-method ray/AABB intersection.
 * Returns the entry t (≥0) when the ray hits, or -1 when it misses.
 * A ray starting inside the box returns 0.
 */
export function rayAabb(
  origin: Vec3,
  dir: Vec3,
  min: Vec3,
  max: Vec3,
): number {
  const o = [origin[0], origin[1], origin[2]];
  const d = [dir[0], dir[1], dir[2]];
  const minv = [min[0], min[1], min[2]];
  const maxv = [max[0], max[1], max[2]];

  let tmin = -Infinity;
  let tmax = Infinity;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < EPS) {
      if (o[i] < minv[i] || o[i] > maxv[i]) return -1;
      continue;
    }
    let t1 = (minv[i] - o[i]) / d[i];
    let t2 = (maxv[i] - o[i]) / d[i];
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }

  if (tmax < 0) return -1;
  return Math.max(tmin, 0);
}

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
register("vreflect", async (a) => {
  const v = parseVec3(a[0]);
  const n = parseVec3(a[1]);
  if (v === null || n === null) return ARGBAD;
  const r = vreflect(v, n);
  return [fmt(r[0]), fmt(r[1]), fmt(r[2])].join(" ");
});

// ── pointinaabb ───────────────────────────────────────────────────────────
register("pointinaabb", async (a) => {
  const args = [0,1,2,3,4,5,6,7,8].map(i => parseN(a[i]));
  if (args.some(v => v === null)) return ARGBAD;
  const [px, py, pz, minx, miny, minz, maxx, maxy, maxz] = args as number[];
  return pointInAabb(
    [px, py, pz],
    [minx, miny, minz],
    [maxx, maxy, maxz],
  ) ? "1" : "0";
});

// ── rayaabb ───────────────────────────────────────────────────────────────
register("rayaabb", async (a) => {
  const args = [0,1,2,3,4,5,6,7,8,9,10,11].map(i => parseN(a[i]));
  if (args.some(v => v === null)) return ARGBAD;
  const [ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz] = args as number[];
  const t = rayAabb(
    [ox, oy, oz],
    [dx, dy, dz],
    [minx, miny, minz],
    [maxx, maxy, maxz],
  );
  return t === -1 ? "-1" : fmt(t);
});
