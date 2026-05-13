// deno-lint-ignore-file require-await
import { register } from "./registry.ts";
import { num, fmt } from "./helpers.ts";

const EPS = 1e-10;

function parseVec3(s: string): [number, number, number] {
  const parts = s.split(" ").map(num);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// ── vreflect ──────────────────────────────────────────────────────────────
// Reflect v across plane with normal n: r = v - 2*(v·n)*n.
// Assumes n is already a unit vector; callers should pass a normalized normal.
register("vreflect", async (a) => {
  const [vx, vy, vz] = parseVec3(a[0] ?? "");
  const [nx, ny, nz] = parseVec3(a[1] ?? "");
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
  const px = num(a[0]), py = num(a[1]), pz = num(a[2]);
  const minx = num(a[3]), miny = num(a[4]), minz = num(a[5]);
  const maxx = num(a[6]), maxy = num(a[7]), maxz = num(a[8]);
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
  const ox = num(a[0]), oy = num(a[1]), oz = num(a[2]);
  const dx = num(a[3]), dy = num(a[4]), dz = num(a[5]);
  const minv = [num(a[6]), num(a[7]), num(a[8])];
  const maxv = [num(a[9]), num(a[10]), num(a[11])];
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
